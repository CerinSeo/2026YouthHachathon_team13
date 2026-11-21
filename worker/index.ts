import type { Coordinate, Mode, Place, WeatherSeries } from '../src/core/contracts';

interface Env { TMAP_APP_KEY?: string }
export type Transport = typeof fetch;
type RecordLike = Record<string, unknown>;
const object = (value: unknown): RecordLike => value !== null && typeof value === 'object'
  ? value as RecordLike : {};
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const error = (status: number, code: string) => json({ status: 'error', code, retryable: status >= 500 }, status);
const delay = 60 * 60 * 1000;
const inBounds = ([x, y]: Coordinate) => x >= 126.73 && x <= 127.20 && y >= 37.39 && y <= 37.72;

async function upstream(transport: Transport, url: URL, headers?: HeadersInit): Promise<unknown> {
  const response = await transport(url, { headers, redirect: 'error', signal: AbortSignal.timeout(9_000) });
  if (!response.ok) throw new Error('UPSTREAM_UNAVAILABLE');
  return response.json();
}

function position(x: unknown, y: unknown): Coordinate | null {
  if (![x, y].every((value) => typeof value === 'number' || string(value) !== '')) return null;
  return [Number(x), Number(y)];
}

function placeFromPoi(raw: unknown): Place | null {
  const poi = object(raw);
  const name = string(poi.name);
  const id = string(poi.id);
  if (!name || !id) return null;
  const front = position(poi.frontLon, poi.frontLat);
  const candidates: [Coordinate | null, Place['coordinate_source']][] = [
    [position(poi.pedestrianEntranceLon, poi.pedestrianEntranceLat), 'pedestrian_entrance'],
    [front, 'entrance'],
    [position(poi.noorLon, poi.noorLat), 'center'],
  ];
  const found = candidates.find(([coordinates]) => coordinates !== null && inBounds(coordinates));
  if (!found?.[0]) return null;
  const road = object(poi.newAddressList).newAddress;
  const mainRoad = object(Array.isArray(road) ? road[0] : null);
  const address = string(mainRoad.fullAddressRoad) || [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName,
    poi.detailAddrName, poi.firstNo].map(string).filter(Boolean).join(' ');
  return { id, name, address, coordinates: found[0], coordinate_source: found[1] };
}

async function search(url: URL, env: Env, transport: Transport) {
  const query = url.searchParams.get('q')?.trim();
  const limit = Number(url.searchParams.get('limit') ?? '7');
  if (!query || query.length > 80 || !Number.isInteger(limit) || limit < 1 || limit > 10) return error(400, 'INVALID_INPUT');
  if (!env.TMAP_APP_KEY) return error(503, 'SEARCH_UNCONFIGURED');
  const target = new URL('https://apis.openapi.sk.com/tmap/pois');
  target.search = new URLSearchParams({
    version: '1', searchKeyword: query, resCoordType: 'WGS84GEO', count: '20',
    centerLon: '126.978', centerLat: '37.5665', radius: '30',
  }).toString();
  const payload = object(await upstream(transport, target, { appKey: env.TMAP_APP_KEY, Accept: 'application/json' }));
  const entries = object(object(payload.searchPoiInfo).pois).poi;
  const places = Array.isArray(entries) ? entries.map(placeFromPoi).filter((place) => place !== null).slice(0, limit) : [];
  return json({ status: 'success', provider: 'tmap', queried_at: new Date().toISOString(), places });
}

function coordinatesOf(params: URLSearchParams): Coordinate[] {
  const lat = params.get('lat')?.split(',') ?? [];
  const lon = params.get('lon')?.split(',') ?? [];
  if (!lat.length || lat.length > 12 || lat.length !== lon.length) return [];
  const coordinates = lat.map((value, index) => position(lon[index], value));
  if (coordinates.some((value) => !value || !inBounds(value))) return [];
  return coordinates as Coordinate[];
}

function seriesFrom(raw: unknown, coordinate: Coordinate, mode: Mode, selected: number,
  model: WeatherSeries['model'], queriedAt: string): WeatherSeries {
  const hourly = object(object(raw).hourly);
  const values = (key: string) => Array.isArray(hourly[key]) ? hourly[key] as unknown[] : [];
  const temperatures = values('temperature_2m');
  const rain = values('precipitation');
  const snow = values('snowfall');
  const hours = values('time').flatMap((timestamp, index) => {
    const seconds = number(timestamp);
    if (seconds === null || seconds * 1000 < selected - 12 * delay || seconds * 1000 > selected) return [];
    return [{ valid_at: new Date(seconds * 1000).toISOString(), temperature_c: number(temperatures[index]),
      precipitation_mm: number(rain[index]), snowfall_cm: number(snow[index]) }];
  });
  return { provider: 'open-meteo', model, location: { coordinates: coordinate }, mode,
    selected_at: new Date(selected).toISOString(), issued_at: null, queried_at: queriedAt, hours,
    data_state: mode === 'historical_replay' ? 'HISTORICAL_REPLAY' : 'FORECAST' };
}

async function weather(url: URL, transport: Transport) {
  const params = url.searchParams;
  const coordinates = coordinatesOf(params);
  const selected = Date.parse(params.get('selectedAt') ?? '');
  const mode = params.get('mode');
  const model = params.get('model') ?? 'best_match';
  const now = Date.now();
  if (!coordinates.length || !Number.isFinite(selected) || selected % delay !== 0
    || (mode !== 'forecast' && mode !== 'current' && mode !== 'historical_replay')
    || (mode === 'historical_replay' ? (selected > now || selected < Date.UTC(2022, 0, 1))
      : (selected < now - delay || selected > now + 24 * delay))
    || (model !== 'best_match' && (model !== 'ecmwf_aifs025_single' || mode !== 'historical_replay'))) {
    return error(400, 'INVALID_INPUT');
  }
  const replay = mode === 'historical_replay';
  const target = new URL(replay ? 'https://historical-forecast-api.open-meteo.com/v1/forecast'
    : 'https://api.open-meteo.com/v1/forecast');
  target.search = new URLSearchParams({
    longitude: coordinates.map(([lon]) => lon).join(','),
    latitude: coordinates.map(([, lat]) => lat).join(','),
    hourly: 'temperature_2m,precipitation,snowfall',
    timezone: 'GMT',
    timeformat: 'unixtime',
    ...(replay ? { start_date: new Date(selected - 12 * delay).toISOString().slice(0, 10),
      end_date: new Date(selected).toISOString().slice(0, 10), models: model }
      : { past_days: '1', forecast_days: '3' }),
  }).toString();
  const payload = await upstream(transport, target);
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length !== coordinates.length) throw new Error('UPSTREAM_UNAVAILABLE');
  const queriedAt = new Date().toISOString();
  const series = coordinates.map((coordinate, index) => seriesFrom(items[index], coordinate, mode, selected, model, queriedAt));
  return coordinates.length === 1 ? json({ status: 'success', ...series[0] }) : json({ status: 'success', series });
}

export async function handleRequest(request: Request, env: Env, transport: Transport = fetch) {
  if (request.method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED');
  const url = new URL(request.url);
  try {
    if (url.pathname === '/api/places/search') return await search(url, env, transport);
    if (url.pathname === '/api/weather/hourly') return await weather(url, transport);
    return error(404, 'NOT_FOUND');
  } catch {
    return error(503, 'UPSTREAM_UNAVAILABLE');
  }
}

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
