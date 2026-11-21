import type { Coordinate } from './contracts';

const radians = Math.PI / 180;
const radius = 6_371_008.8;
export type Bounds = readonly [south: number, west: number, north: number, east: number];
export type Polygon = Coordinate[][];

export function distance(a: Coordinate, b: Coordinate) {
  const y = Math.sin((b[1] - a[1]) * radians / 2);
  const x = Math.sin((b[0] - a[0]) * radians / 2);
  const h = y * y + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * x * x;
  return 2 * radius * Math.asin(Math.sqrt(Math.min(1, h)));
}

export const interpolate = (a: Coordinate, b: Coordinate, t: number): Coordinate =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function inRing([x, y]: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export const inCity = (point: Coordinate, polygons: Polygon[]) =>
  polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole)));

export const inBounds = ([x, y]: Coordinate, [s, w, n, e]: Bounds) =>
  Number.isFinite(x) && Number.isFinite(y) && x >= w && x <= e && y >= s && y <= n;

export function exitDistance([x, y]: Coordinate, local: Bounds, city: Bounds) {
  const [s, w, n, e] = local;
  const latitude = (lat: number) => Math.abs(lat - y) * radians * radius;
  const longitude = (lon: number) => Math.asin(Math.abs(Math.cos(y * radians) * Math.sin((lon - x) * radians))) * radius;
  return Math.min(s > city[0] ? latitude(s) : Infinity, w > city[1] ? longitude(w) : Infinity,
    n < city[2] ? latitude(n) : Infinity, e < city[3] ? longitude(e) : Infinity);
}

export function heading(a: Coordinate, b: Coordinate) {
  return Math.atan2((b[0] - a[0]) * Math.cos(a[1] * radians), b[1] - a[1]) / radians;
}

export function inBuildingShadow(point: Coordinate, ring: Coordinate[], towardSun: Coordinate) {
  if (inRing(point, ring)) return false;
  const [rx, ry] = towardSun;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const sx = bx - ax;
    const sy = by - ay;
    const determinant = rx * sy - ry * sx;
    if (Math.abs(determinant) < 1e-20) continue;
    const dx = ax - point[0];
    const dy = ay - point[1];
    const t = (dx * sy - dy * sx) / determinant;
    const u = (dx * ry - dy * rx) / determinant;
    if (t > 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

export function sunAt(point: Coordinate, timestamp: number) {
  const date = new Date(timestamp);
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const yearHours = (Date.UTC(date.getUTCFullYear() + 1, 0, 1) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000;
  const gamma = 2 * Math.PI / yearHours * (day - 1 + (hour - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(gamma * 2) - 0.040849 * Math.sin(gamma * 2));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const h = ((hour * 60 + eqtime + 4 * point[0]) / 4 - 180) * radians;
  const latitude = point[1] * radians;
  const east = -Math.cos(declination) * Math.sin(h);
  const north = Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * Math.cos(declination) * Math.cos(h);
  const elevation = Math.asin(Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(h));
  const azimuth = Math.atan2(east, north);
  return { elevation, azimuth };
}
