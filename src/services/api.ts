import type { Coordinate, Place, RouteRequest, WeatherSeries } from '../core/contracts';
import { sha256 } from '../core/tiles';

const archivePath = '/data/weather/aifs-20260202';
const archiveHour = Date.parse('2026-02-02T04:00:00Z');
let historical: Promise<Map<string, WeatherSeries>> | undefined;
const pointKey = (point: Coordinate) => point.map((value) => value.toFixed(6)).join(',');

function localReplay() {
  historical ??= (async () => {
    const [file, checksum] = await Promise.all([fetch(`${archivePath}.json`), fetch(`${archivePath}.sha256`)]);
    if (!file.ok || !checksum.ok) throw new Error('WEATHER_ARCHIVE_UNAVAILABLE');
    const bytes = await file.arrayBuffer();
    if (await sha256(bytes) !== (await checksum.text()).trim()) throw new Error('WEATHER_ARCHIVE_UNAVAILABLE');
    const { series } = JSON.parse(new TextDecoder().decode(bytes)) as { series: WeatherSeries[] };
    if (series.some((item) => Date.parse(item.selected_at) !== archiveHour || item.model !== 'ecmwf_aifs025_single')) {
      throw new Error('WEATHER_ARCHIVE_UNAVAILABLE');
    }
    return new Map(series.map((item) => [pointKey(item.location.coordinates), item]));
  })().catch(() => { historical = undefined; return new Map<string, WeatherSeries>(); });
  return historical;
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '8' });
  const response = await fetch(`/api/places/search?${params}`, { signal });
  if (!response.ok) throw new Error('SEARCH_FAILED');
  const { places } = await response.json() as { places: Place[] };
  if (!Array.isArray(places)) throw new Error('SEARCH_FAILED');
  return places;
}

export async function loadWeather(points: Coordinate[], request: RouteRequest, signal?: AbortSignal) {
  if (request.mode === 'historical_replay' && request.model === 'ecmwf_aifs025_single'
    && Date.parse(request.selectedAt) === archiveHour) {
    const recorded = await localReplay();
    signal?.throwIfAborted();
    const matching = points.map((point) => recorded.get(pointKey(point)));
    if (matching.every((item) => item !== undefined)) return matching;
  }
  const params = new URLSearchParams({
    lon: points.map(([lon]) => lon.toFixed(6)).join(','),
    lat: points.map(([, lat]) => lat.toFixed(6)).join(','),
    selectedAt: request.selectedAt, mode: request.mode, model: request.model ?? 'best_match',
  });
  const response = await fetch(`/api/weather/hourly?${params}`, { signal });
  if (!response.ok) throw new Error('WEATHER_FAILED');
  const payload = await response.json() as WeatherSeries | { series: WeatherSeries[] };
  const series = 'series' in payload ? payload.series : [payload];
  if (series.length !== points.length || series.some((value) => !Array.isArray(value.hours))) {
    throw new Error('WEATHER_FAILED');
  }
  return series;
}
