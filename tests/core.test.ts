import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Coordinate, WeatherSeries } from '../src/core/contracts';
import { inBuildingShadow, inCity, sunAt } from '../src/core/geo';
import { accessFeature, asRoute, walkable, WalkGraph } from '../src/core/graph';
import { classifyWeather } from '../src/core/risk';
import { decodeTile, tileWindow, type TileIndex } from '../src/core/tiles';

const input = (filename: string) => JSON.parse(readFileSync(new URL(`../public/data/seoul-walk/${filename}`, import.meta.url), 'utf-8'));
const index = input('index.json') as TileIndex;
const seoulCityHall: Coordinate = [126.978, 37.5665];
const yangjae: Coordinate = [127.034, 37.483];

describe('Seoul walking data', () => {
  it('decodes every supplied tile without losing node references', () => {
    const tiles = Object.keys(index.tiles).map((id) => decodeTile(input(`${id}.json`), index.bbox));
    expect(tiles).toHaveLength(108);
    expect(tiles.flatMap((tile) => tile.ways).length).toBeGreaterThan(50_000);
    expect(tiles.flatMap((tile) => tile.buildings).length).toBeGreaterThan(50_000);
  });

  it('checks the administrative boundary rather than its bounding rectangle', () => {
    const polygons = input('boundary.json').geometry.coordinates;
    expect(inCity(seoulCityHall, polygons)).toBe(true);
    expect(inCity(yangjae, polygons)).toBe(true);
    const gwangmyeong: Coordinate = [126.8647, 37.4786];
    expect(inCity(gwangmyeong, polygons)).toBe(false);
  });

  it('merges real adjacent tiles and computes a walk-only route', () => {
    const origin: Coordinate = [127.032, 37.484];
    const destination: Coordinate = [127.035, 37.484];
    const { ids, bounds } = tileWindow(origin, destination, 0.05, index);
    const graph = new WalkGraph(ids.map((id) => decodeTile(input(`${id}.json`), index.bbox)), bounds);
    const start = graph.snap(origin), end = graph.snap(destination);
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    const edges = graph.shortest(start!.id, end!.id);
    expect(edges?.length).toBeGreaterThan(1);
    expect(edges?.every((edge) => walkable(edge.tags))).toBe(true);
    const route = asRoute(edges!);
    expect(route.durationSeconds).toBe(route.distanceM);
    expect(route.turns.length).toBeGreaterThan(0);
  });
});

describe('edge and weather rules', () => {
  it('excludes road centerlines, disallowed crossing and unmarked bicycle ways', () => {
    expect(walkable({ highway: 'residential', foot: 'yes' })).toBe(false);
    expect(walkable({ highway: 'cycleway' })).toBe(false);
    expect(walkable({ highway: 'cycleway', foot: 'designated' })).toBe(true);
    expect(walkable({ highway: 'footway', crossing: 'no' })).toBe(false);
    expect(walkable({ highway: 'footway', foot: 'private' })).toBe(false);
    expect(accessFeature({ incline: '-5%' })).toBe('incline');
    expect(accessFeature({ incline: '0%' })).toBeNull();
    expect(accessFeature({ highway: 'steps' })).toBe('steps');
  });
  it('keeps missing weather distinct from confirmed zero precipitation', () => {
    const t = Date.parse('2026-02-02T04:00:00Z');
    const hours = Array.from({ length: 6 }, (_, i) => ({
      valid_at: new Date(t - i * 3_600_000).toISOString(), temperature_c: -1, precipitation_mm: 0, snowfall_cm: 0,
    }));
    const series = { hours } as WeatherSeries;
    expect(classifyWeather(series, t)).toBe('no_evidence');
    hours.pop();
    expect(classifyWeather(series, t)).toBe('unknown');
    hours[1].snowfall_cm = 0.1;
    expect(classifyWeather(series, t)).toBe('wet_freezing');
    expect(classifyWeather(undefined, t)).toBe('unknown');
  });
  it('projects an outdoor building shadow away from the sun', () => {
    const ring: Coordinate[] = [[1, 1], [3, 1], [3, 3], [1, 3]];
    expect(inBuildingShadow([0, 2], ring, [2, 0])).toBe(true);
    expect(inBuildingShadow([2, 2], ring, [2, 0])).toBe(false);
    expect(inBuildingShadow([4, 2], ring, [2, 0])).toBe(false);
    expect(sunAt(yangjae, Date.parse('2026-02-02T04:00:00Z')).elevation).toBeGreaterThan(0.5);
  });
});
