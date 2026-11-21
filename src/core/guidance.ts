import type { Coordinate, RiskSegment, WalkingRoute } from './contracts';
import { distance, interpolate } from './geo';

export type CueKind = 'left' | 'right' | 'risk' | 'arrival';
export interface Cue { kind: CueKind; offset: number }
export interface GuidancePlan { route: WalkingRoute; offsets: number[]; cues: Cue[] }

const thresholds: Record<CueKind, number> = { left: 28, right: 28, risk: 40, arrival: 10 };
const descriptions: Record<CueKind, string> = {
  left: '왼쪽으로 도세요',
  right: '오른쪽으로 도세요',
  risk: '결빙 위험 예상구간에 주의하세요',
  arrival: '목적지 근처에 도착해요',
};

function projection(point: Coordinate, start: Coordinate, end: Coordinate) {
  const scale = Math.cos(start[1] * Math.PI / 180);
  const dx = (end[0] - start[0]) * scale, dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  if (length === 0) return 0;
  const x = (point[0] - start[0]) * scale, y = point[1] - start[1];
  return Math.max(0, Math.min(1, (x * dx + y * dy) / length));
}

export function planGuidance(route: WalkingRoute, risks: RiskSegment[]): GuidancePlan {
  const offsets = [0];
  const risksByEdge = new Map<string, RiskSegment[]>();
  for (const risk of risks) {
    const entries = risksByEdge.get(risk.edgeId) ?? [];
    entries.push(risk);
    risksByEdge.set(risk.edgeId, entries);
  }
  const ranges: { start: number; end: number }[] = [];
  for (let i = 1; i < route.coordinates.length; i++) {
    const a = route.coordinates[i - 1], b = route.coordinates[i];
    const length = distance(a, b);
    const offset = offsets[i - 1];
    offsets.push(offset + length);
    for (const { geometry } of risksByEdge.get(route.edgeIds[i - 1]) ?? []) {
      const first = projection(geometry[0], a, b), last = projection(geometry[1], a, b);
      ranges.push({ start: offset + Math.min(first, last) * length, end: offset + Math.max(first, last) * length });
    }
  }
  const cues: Cue[] = route.turns.map(({ direction, vertexIndex }) => ({ kind: direction, offset: offsets[vertexIndex] }));
  let riskEnd = -Infinity;
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    if (range.start > riskEnd + 3) cues.push({ kind: 'risk', offset: range.start });
    riskEnd = Math.max(riskEnd, range.end);
  }
  cues.push({ kind: 'arrival', offset: offsets.at(-1)! });
  return { route, offsets, cues: cues.sort((a, b) => a.offset - b.offset) };
}

export function matchPosition(plan: GuidancePlan, point: Coordinate, accuracy: number, previous: number | null) {
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 30) return null;
  const min = Math.max(0, (previous ?? 0) - 24);
  const max = previous === null ? 55 : previous + 85;
  const tolerance = Math.min(34, Math.max(13, accuracy + 6));
  let match: { offset: number; deviation: number } | null = null;
  const { coordinates } = plan.route;
  for (let i = 1; i < coordinates.length; i++) {
    const before = plan.offsets[i - 1], after = plan.offsets[i];
    if (after < min) continue;
    if (before > max) break;
    const a = coordinates[i - 1], b = coordinates[i];
    const t = projection(point, a, b);
    const offset = before + (after - before) * t;
    if (offset < min || offset > max) continue;
    const deviation = distance(point, interpolate(a, b, t));
    if (deviation <= tolerance && (!match || deviation < match.deviation - 2)) match = { offset, deviation };
  }
  return match?.offset ?? null;
}

export const isUpcoming = (cue: Cue, offset: number) => cue.offset >= offset - 8;
export const shouldAnnounce = (cue: Cue, offset: number) => isUpcoming(cue, offset) && cue.offset - offset <= thresholds[cue.kind];

export function cueText(cue: Cue, from: number, approaching = false) {
  if (approaching && cue.kind === 'arrival') return '목적지 근처입니다';
  const remaining = Math.round(Math.max(0, cue.offset - from) / 5) * 5;
  const prefix = approaching ? '곧 ' : remaining === 0 ? '' : `약 ${remaining}미터 후, `;
  return `${prefix}${descriptions[cue.kind]}`;
}
