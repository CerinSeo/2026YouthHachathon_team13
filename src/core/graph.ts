import type { Coordinate, WalkingRoute } from './contracts';
import { distance, heading, inBounds, interpolate, type Bounds } from './geo';
import type { Tags, Tile, WalkNode, WalkWay } from './tiles';

export interface Edge {
  id: string;
  from: number;
  to: number;
  a: Coordinate;
  b: Coordinate;
  meters: number;
  tags: Tags;
}

export function accessAllowed(tags: Tags) {
  if (['no', 'private', 'use_sidepath'].includes(tags.foot)) return false;
  if (['yes', 'designated', 'permissive'].includes(tags.foot)) return true;
  return !['no', 'private', 'permit', 'customers', 'destination'].includes(tags.access);
}

export function walkable(tags: Tags) {
  if (!accessAllowed(tags) || tags.motorroad === 'yes' || tags.crossing === 'no' || tags.area === 'yes') return false;
  if (tags.highway === 'cycleway') return ['yes', 'designated', 'permissive'].includes(tags.foot);
  return ['footway', 'pedestrian', 'path', 'steps'].includes(tags.highway);
}

const traversable = (node: WalkNode) => accessAllowed(node.tags)
  && node.tags.crossing !== 'no' && node.tags.locked !== 'yes'
  && (!node.tags.barrier || ['yes', 'designated', 'permissive'].includes(node.tags.foot)
    || ['bollard', 'cycle_barrier', 'kerb', 'gate', 'lift_gate', 'swing_gate'].includes(node.tags.barrier));

export function accessFeature(tags: Tags) {
  if (tags.highway === 'steps' || tags.stairs === 'yes' || tags.steps === 'yes' || Number(tags.step_count) > 0) return 'steps';
  const slope = tags.incline?.trim();
  const numeric = slope && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:%|°|deg)?$/.test(slope);
  if (tags.footway === 'ramp' || ['yes', 'wheelchair'].includes(tags.ramp)
    || (slope && (['up', 'down', 'up/down', 'down/up', 'yes'].includes(slope)
      || (numeric && parseFloat(slope) !== 0)))) return 'incline';
  return null;
}

interface Entry { node: number; length: number }

class Queue {
  private items: Entry[] = [];
  push(entry: Entry) {
    let i = this.items.length;
    this.items.push(entry);
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.items[parent].length <= entry.length) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = entry;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (!last || !this.items.length) return first;
    let i = 0;
    while (2 * i + 1 < this.items.length) {
      let child = 2 * i + 1;
      if (child + 1 < this.items.length && this.items[child + 1].length < this.items[child].length) child++;
      if (last.length <= this.items[child].length) break;
      this.items[i] = this.items[child];
      i = child;
    }
    this.items[i] = last;
    return first;
  }
}

export class WalkGraph {
  private readonly nodes = new Map<number, WalkNode>();
  private readonly links = new Map<number, Edge[]>();

  constructor(tiles: Tile[], bounds: Bounds) {
    const ways = new Map<number, WalkWay>();
    for (const tile of tiles) for (const way of tile.ways) ways.set(way.id, way);
    for (const way of ways.values()) {
      const { tags, nodes } = way;
      if (!walkable(tags)) continue;
      for (let i = 0; i + 1 < nodes.length; i++) {
        const a = nodes[i], b = nodes[i + 1];
        if (!traversable(a) || !traversable(b) || !inBounds(interpolate(a.coordinate, b.coordinate, 0.5), bounds)) continue;
        const meters = distance(a.coordinate, b.coordinate);
        if (meters <= 0) continue;
        const id = `way/${way.id}:${i}`;
        const edge = { id, from: a.id, to: b.id, a: a.coordinate, b: b.coordinate, meters, tags };
        if (tags['oneway:foot'] !== '-1' && tags['foot:forward'] !== 'no') this.link(a, b, edge);
        if (!['yes', '1', 'true'].includes(tags['oneway:foot']) && tags['foot:backward'] !== 'no') {
          this.link(b, a, { ...edge, from: b.id, to: a.id, a: b.coordinate, b: a.coordinate });
        }
      }
    }
  }

  private link(a: WalkNode, b: WalkNode, edge: Edge) {
    this.nodes.set(a.id, a);
    this.nodes.set(b.id, b);
    const edges = this.links.get(a.id);
    if (edges) edges.push(edge);
    else this.links.set(a.id, [edge]);
  }

  snap(point: Coordinate) {
    let nearest: WalkNode | undefined;
    let limit = 80;
    for (const node of this.nodes.values()) {
      const meters = distance(point, node.coordinate);
      if (meters < limit || (meters === limit && (!nearest || node.id < nearest.id))) {
        nearest = node;
        limit = meters;
      }
    }
    return nearest;
  }

  shortest(from: number, to: number, excluded: (edge: Edge) => boolean = () => false): Edge[] | null {
    const distances = new Map([[from, 0]]);
    const previous = new Map<number, Edge>();
    const queue = new Queue();
    queue.push({ node: from, length: 0 });
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      if (entry.length !== distances.get(entry.node)) continue;
      if (entry.node === to) {
        const edges = [];
        for (let edge = previous.get(to); edge; edge = previous.get(edge.from)) edges.push(edge);
        return edges.reverse();
      }
      for (const edge of this.links.get(entry.node) ?? []) {
        const length = entry.length + edge.meters;
        if (length >= (distances.get(edge.to) ?? Infinity) || excluded(edge)) continue;
        distances.set(edge.to, length);
        previous.set(edge.to, edge);
        queue.push({ node: edge.to, length });
      }
    }
    return null;
  }
}

export function asRoute(edges: Edge[]): WalkingRoute {
  const coordinates = [edges[0].a, ...edges.map((edge) => edge.b)];
  const distanceM = edges.reduce((total, edge) => total + edge.meters, 0);
  const turns: WalkingRoute['turns'] = [];
  for (let i = 1; i < coordinates.length - 1; i++) {
    const angle = (heading(coordinates[i], coordinates[i + 1]) - heading(coordinates[i - 1], coordinates[i]) + 540) % 360 - 180;
    if (Math.abs(angle) >= 45 && Math.abs(angle) <= 150 && edges[i - 1].meters >= 2 && edges[i].meters >= 2) {
      turns.push({ direction: angle < 0 ? 'left' : 'right', coordinates: coordinates[i] });
    }
  }
  return { edgeIds: edges.map((edge) => edge.id), coordinates, distanceM, durationSeconds: distanceM, turns };
}
