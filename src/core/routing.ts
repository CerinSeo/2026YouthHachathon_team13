import { loadWeather } from '../services/api';
import { RouteError, type RiskSegment, type RouteComparison, type RouteRequest } from './contracts';
import { exitDistance, inCity, interpolate } from './geo';
import { accessFeature, asRoute, type Edge, WalkGraph } from './graph';
import { BuildingShadows, classifyWeather, expectedSegments, type WeatherEvidence } from './risk';
import { canLoad, NetworkData, tileCenter, tileFor, type TileIndex, tileWindow } from './tiles';

const areas = [0.015, 0.055, 0.135, 0.5];
const network = new NetworkData();
export const routeMetadata = () => network.metadata();

export async function compareRoutes(request: RouteRequest, signal?: AbortSignal): Promise<RouteComparison> {
  const { index, boundary } = await network.metadata();
  const from = request.origin.coordinates, to = request.destination.coordinates;
  if (![from, to].every((point) => canLoad(point, index) && inCity(point, boundary))) throw new RouteError('OUTSIDE_SEOUL');
  const timestamp = Date.parse(request.selectedAt);
  if (!Number.isFinite(timestamp) || timestamp % 3_600_000 !== 0) throw new Error('INVALID_INPUT');
  const forecastByTile = new Map<string, WeatherEvidence>();
  let failedWeather = false;
  let previousKey = '';
  for (const margin of areas) {
    signal?.throwIfAborted();
    const { ids, bounds } = tileWindow(from, to, margin, index);
    const windowKey = ids.join(',');
    if (windowKey === previousKey) continue;
    previousKey = windowKey;
    const tiles = await Promise.all(ids.map((id) => network.tile(id, index)));
    signal?.throwIfAborted();
    const graph = new WalkGraph(tiles, bounds);
    const start = graph.snap(from), end = graph.snap(to);
    if (!start || !end) throw new RouteError('NETWORK_SNAP_FAILED');
    if (start.id === end.id) throw new RouteError('SAME_NETWORK_NODE');
    const baselineEdges = graph.shortest(start.id, end.id);
    const entireNetwork = ids.length === Object.keys(index.tiles).length;
    if (!baselineEdges?.length) {
      if (entireNetwork) throw new RouteError('BASELINE_ROUTE_NOT_FOUND');
      continue;
    }
    const baseline = asRoute(baselineEdges);
    const exit = exitDistance(start.coordinate, bounds, index.bbox) + exitDistance(end.coordinate, bounds, index.bbox);
    if (!entireNetwork && baseline.distanceM >= exit) continue;

    const tileOf = (edge: Edge) => tileFor(interpolate(edge.a, edge.b, 0.5), index);
    const updateWeather = async (required: string[]) => {
      const pending = [...new Set(required)].filter((id) => !forecastByTile.has(id));
      for (let i = 0; i < pending.length; i += 48) {
        const batches = [];
        for (let j = i; j < Math.min(i + 48, pending.length); j += 12) batches.push(pending.slice(j, j + 12));
        await Promise.all(batches.map(async (batch) => {
          try {
            const values = await weatherForTiles(batch, index, request, signal);
            batch.forEach((id, i) => forecastByTile.set(id, classifyWeather(values[i], timestamp)));
          } catch {
            signal?.throwIfAborted();
            failedWeather = true;
            batch.forEach((id) => forecastByTile.set(id, 'unknown'));
          }
        }));
      }
    };
    const evidence = (id: string): WeatherEvidence => forecastByTile.get(id) ?? 'unknown';
    const partial = (): RouteComparison => ({
      baseline, networkAsOf: index.osmTimestamp, mode: request.mode, selectedAt: request.selectedAt,
      model: request.model ?? 'best_match', riskRuleVersion: 'risk-rule-v1',
      recommendation: { status: 'not_evaluated', route: null, additionalSeconds: null },
      riskSegments: [], dataAsOf: null,
      unmappedAccessFeatures: false, reason: failedWeather ? 'weather_failed' : 'missing',
    });

    await updateWeather(baselineEdges.map(tileOf));
    const buildings = Array.from(new Map(tiles.flatMap((tile) => tile.buildings.map((building) => [building.id, building]))).values());
    let shadows: BuildingShadows | undefined;
    const predicted = new Map<string, RiskSegment[]>();
    const risk = (edge: Edge) => {
      const existing = predicted.get(edge.id);
      if (existing) return existing;
      if (evidence(tileOf(edge)) !== 'wet_freezing') return [];
      shadows ??= new BuildingShadows(buildings, timestamp, interpolate(from, to, 0.5));
      const segments = expectedSegments(edge, 'wet_freezing', shadows);
      predicted.set(edge.id, segments);
      return segments;
    };
    const riskSegments = baselineEdges.flatMap(risk);
    if (baselineEdges.some((edge) => evidence(tileOf(edge)) === 'unknown')) return partial();
    const blocked = (edge: Edge) => Boolean(accessFeature(edge.tags)) || risk(edge).length > 0;
    const needsDetour = baselineEdges.some(blocked);
    let alternateEdges = baselineEdges;
    if (needsDetour) {
      await updateWeather(ids);
      const withKnownWeather = graph.shortest(start.id, end.id, (edge) => blocked(edge) || evidence(tileOf(edge)) === 'unknown');
      if (!entireNetwork && (!withKnownWeather?.length || asRoute(withKnownWeather).distanceM >= exit)) continue;
      if (ids.some((id) => evidence(id) === 'unknown')) {
        const assumingUnknownOpen = graph.shortest(start.id, end.id, blocked);
        if (assumingUnknownOpen?.some((edge) => evidence(tileOf(edge)) === 'unknown')) return partial();
      }
      alternateEdges = withKnownWeather ?? [];
      if (alternateEdges.some(blocked)) throw new Error('Route validation failed');
    }

    const route = alternateEdges.length ? asRoute(alternateEdges) : null;
    return {
      baseline, riskSegments, networkAsOf: index.osmTimestamp, selectedAt: request.selectedAt,
      mode: request.mode, model: request.model ?? 'best_match',
      riskRuleVersion: 'risk-rule-v1', dataAsOf: request.selectedAt,
      unmappedAccessFeatures: alternateEdges.some(({ tags }) => tags.incline === undefined || tags.stairs === undefined),
      recommendation: route ? {
        status: needsDetour ? 'available' : 'same_as_baseline',
        route, additionalSeconds: route.durationSeconds - baseline.durationSeconds,
      } : { status: 'unavailable', route: null, additionalSeconds: null },
      reason: route ? undefined : 'constraints',
    };
  }
  throw new RouteError('BASELINE_ROUTE_NOT_FOUND');
}

function weatherForTiles(ids: string[], index: TileIndex, request: RouteRequest, signal?: AbortSignal) {
  return loadWeather(ids.map((id) => tileCenter(id, index)), request, signal);
}
