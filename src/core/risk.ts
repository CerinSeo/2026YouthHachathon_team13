import type { Coordinate, RiskSegment, WeatherSeries } from './contracts';
import { inBuildingShadow, interpolate, sunAt } from './geo';
import type { Edge } from './graph';
import type { Building } from './tiles';

export type WeatherEvidence = 'wet_freezing' | 'no_evidence' | 'unknown';
const hour = 3_600_000;

export function classifyWeather(series: WeatherSeries | undefined, target: number): WeatherEvidence {
  const hours = new Map(series?.hours.map((value) => [Date.parse(value.valid_at), value]));
  const temperature = hours.get(target)?.temperature_c;
  if (temperature == null) return 'unknown';
  if (temperature > 0) return 'no_evidence';
  let complete = true;
  for (let i = 0; i < 6; i++) {
    const weather = hours.get(target - i * hour);
    if ((weather?.precipitation_mm ?? 0) > 0 || (weather?.snowfall_cm ?? 0) > 0) return 'wet_freezing';
    if (weather?.precipitation_mm == null || weather.precipitation_mm < 0) complete = false;
  }
  return complete ? 'no_evidence' : 'unknown';
}

const grid = 0.002;
const gridIndex = (value: number) => Math.floor(value / grid);
const key = (x: number, y: number) => `${x}:${y}`;

interface ProjectedBuilding { ring: Coordinate[]; towardSun: Coordinate }

export class BuildingShadows {
  private cells = new Map<string, ProjectedBuilding[]>();

  constructor(buildings: Building[], at: number, area: Coordinate) {
    const { azimuth, elevation } = sunAt(area, at);
    if (elevation < 8 * Math.PI / 180) return;
    const metersPerLonDegree = 111_195 * Math.cos(area[1] * Math.PI / 180);
    const degreesEast = Math.sin(azimuth) / (metersPerLonDegree * Math.tan(elevation));
    const degreesNorth = Math.cos(azimuth) / (111_195 * Math.tan(elevation));
    for (const building of buildings) {
      const dx = degreesEast * building.height, dy = degreesNorth * building.height;
      const west = Math.min(...building.ring.map(([x]) => x));
      const east = Math.max(...building.ring.map(([x]) => x));
      const south = Math.min(...building.ring.map(([, y]) => y));
      const north = Math.max(...building.ring.map(([, y]) => y));
      const projection: ProjectedBuilding = { ring: building.ring, towardSun: [dx, dy] };
      for (let x = gridIndex(Math.min(west, west - dx)); x <= gridIndex(Math.max(east, east - dx)); x++) {
        for (let y = gridIndex(Math.min(south, south - dy)); y <= gridIndex(Math.max(north, north - dy)); y++) {
          const id = key(x, y), existing = this.cells.get(id);
          if (existing) existing.push(projection);
          else this.cells.set(id, [projection]);
        }
      }
    }
  }

  has(point: Coordinate) {
    return this.cells.get(key(gridIndex(point[0]), gridIndex(point[1])))?.some(({ ring, towardSun }) =>
      inBuildingShadow(point, ring, towardSun)) ?? false;
  }
}

export function expectedSegments(edge: Edge, evidence: WeatherEvidence, shadows: BuildingShadows): RiskSegment[] {
  if (evidence !== 'wet_freezing') return [];
  const { a, b, tags, id } = edge;
  if (tags.covered === 'yes' || ['yes', 'corridor', 'room'].includes(tags.indoor)
    || (tags.tunnel && tags.tunnel !== 'no') || tags.location === 'underground') return [];
  if (tags.bridge && tags.bridge !== 'no') return [{ edgeId: id, geometry: [a, b] }];
  const count = Math.ceil(edge.meters / 5);
  const segments: RiskSegment[] = [];
  let start: Coordinate | null = null;
  for (let i = 0; i <= count; i++) {
    const shaded = i < count && shadows.has(interpolate(a, b, (i + 0.5) / count));
    if (shaded && !start) start = interpolate(a, b, i / count);
    if (!shaded && start) {
      segments.push({ edgeId: id, geometry: [start, interpolate(a, b, i / count)] });
      start = null;
    }
  }
  return segments;
}
