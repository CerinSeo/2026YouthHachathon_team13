import { type Coordinate, RouteError } from './contracts';
import { type Bounds, type Polygon, inBounds } from './geo';

export type Tags = Readonly<Record<string, string>>;
export interface WalkNode { id: number; coordinate: Coordinate; tags: Tags }
export interface WalkWay { id: number; nodes: WalkNode[]; tags: Tags }
export interface Building { id: number; height: number; ring: Coordinate[] }
export interface Tile { ways: WalkWay[]; buildings: Building[] }
export interface TileIndex {
  bbox: Bounds;
  step: number;
  osmTimestamp: string;
  tiles: Record<string, string>;
}

class Varints {
  private offset = 0;
  private readonly bytes: string;
  constructor(base64: string) { this.bytes = atob(base64); }
  get more() { return this.offset < this.bytes.length; }
  unsigned() {
    let value = 0;
    let factor = 1;
    for (let step = 0; step < 8 && this.more; step++) {
      const byte = this.bytes.charCodeAt(this.offset++);
      value += (byte & 127) * factor;
      if (byte < 128 && Number.isSafeInteger(value)) return value;
      factor *= 128;
    }
    throw new Error('Invalid varint');
  }
  signed() {
    const value = this.unsigned();
    return value % 2 ? -(value + 1) / 2 : value / 2;
  }
}

interface PackedTile { n: string; w: string; b: string; t: Tags[] }
const scale = 10_000_000;

export function decodeTile(payload: PackedTile, [south, west]: Bounds): Tile {
  const { t: tags } = payload;
  const nodes = [];
  const coordinates = (x: number, y: number): Coordinate => [west + x / scale, south + y / scale];
  const n = new Varints(payload.n);
  let id = 0, x = 0, y = 0;
  while (n.more) {
    id += n.signed();
    x += n.signed();
    y += n.signed();
    const nodeTags = tags[n.signed()];
    if (id <= 0 || !nodeTags) throw new Error('Invalid node');
    nodes.push({ id, coordinate: coordinates(x, y), tags: nodeTags });
  }
  const w = new Varints(payload.w);
  const ways = [];
  id = 0;
  while (w.more) {
    id += w.signed();
    const wayTags = tags[w.signed()];
    const count = w.signed();
    if (id <= 0 || !wayTags || count < 2 || count > 100_000) throw new Error('Invalid walking way');
    let index = 0;
    const references = [];
    for (let i = 0; i < count; i++) {
      index += w.signed();
      if (!nodes[index]) throw new Error('Missing way node');
      references.push(nodes[index]);
    }
    ways.push({ id, tags: wayTags, nodes: references });
  }
  const b = new Varints(payload.b);
  const buildings = [];
  id = x = y = 0;
  while (b.more) {
    id += b.signed();
    const height = b.unsigned() / 1_000;
    const count = b.unsigned();
    if (id <= 0 || height <= 0 || count < 6 || count % 2 || count > 100_000) throw new Error('Invalid building');
    x += b.signed();
    y += b.signed();
    const ring = [coordinates(x, y)];
    let px = x, py = y;
    for (let i = 2; i < count; i += 2) {
      px += b.signed();
      py += b.signed();
      ring.push(coordinates(px, py));
    }
    buildings.push({ id, height, ring });
  }
  return { ways, buildings };
}

const prefix = '/data/seoul-walk';
export const sha256 = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function loadJson(path: string) {
  const response = await fetch(`${prefix}/${path}`);
  if (!response.ok) throw new RouteError('MAP_DATA_UNAVAILABLE');
  return response;
}

export function tileFor(point: Coordinate, index: TileIndex) {
  const [south, west, north, east] = index.bbox;
  const col = Math.min(Math.ceil((east - west) / index.step) - 1, Math.max(0, Math.floor((point[0] - west) / index.step)));
  const row = Math.min(Math.ceil((north - south) / index.step) - 1, Math.max(0, Math.floor((point[1] - south) / index.step)));
  return `${col}-${row}`;
}

export function tileBounds(id: string, { bbox, step }: TileIndex): Bounds {
  const [col, row] = id.split('-').map(Number);
  const [south, west, north, east] = bbox;
  return [south + row * step, west + col * step, Math.min(north, south + (row + 1) * step),
    Math.min(east, west + (col + 1) * step)];
}

export const tileCenter = (id: string, index: TileIndex): Coordinate => {
  const [s, w, n, e] = tileBounds(id, index);
  return [(w + e) / 2, (s + n) / 2];
};

export function tileWindow(origin: Coordinate, destination: Coordinate, margin: number, index: TileIndex) {
  const [south, west, north, east] = index.bbox;
  const a = tileFor([Math.max(west, Math.min(origin[0], destination[0]) - margin),
    Math.max(south, Math.min(origin[1], destination[1]) - margin)], index);
  const b = tileFor([Math.min(east, Math.max(origin[0], destination[0]) + margin),
    Math.min(north, Math.max(origin[1], destination[1]) + margin)], index);
  const [col1, row1] = a.split('-').map(Number);
  const [col2, row2] = b.split('-').map(Number);
  const first = tileBounds(a, index), last = tileBounds(b, index);
  const bounds: Bounds = [first[0], first[1], last[2], last[3]];
  const ids = [];
  for (let x = col1; x <= col2; x++) for (let y = row1; y <= row2; y++) ids.push(`${x}-${y}`);
  return { ids, bounds };
}

export class NetworkData {
  private init?: Promise<{ index: TileIndex; boundary: Polygon[] }>;
  private tiles = new Map<string, Promise<Tile>>();

  metadata() {
    this.init ??= Promise.all([loadJson('index.json'), loadJson('boundary.json')])
      .then(async ([a, b]) => {
        const index = await a.json();
        const boundary = await b.json();
        if (index.tileFormat !== 1 || index.license !== 'ODbL 1.0' || index.step !== 0.04
          || !index.tiles || !Date.parse(index.osmTimestamp) || !Array.isArray(index.bbox)
          || index.bbox.length !== 4 || !index.bbox.every(Number.isFinite)
          || boundary.geometry?.type !== 'MultiPolygon') throw new Error('Invalid network metadata');
        return { index, boundary: boundary.geometry.coordinates };
      }).catch(() => {
        this.init = undefined;
        throw new RouteError('MAP_DATA_UNAVAILABLE');
      });
    return this.init;
  }

  tile(id: string, index: TileIndex) {
    const previous = this.tiles.get(id);
    if (previous) return previous;
    const next = (async () => {
      const check = index.tiles[id];
      if (!/^\d+-\d+$/.test(id) || !check) throw new Error('Missing tile');
      const bytes = await (await loadJson(`${id}.json`)).arrayBuffer();
      if (await sha256(bytes) !== check) throw new Error('Invalid tile hash');
      return decodeTile(JSON.parse(new TextDecoder().decode(bytes)), index.bbox);
    })().catch(() => {
      this.tiles.delete(id);
      throw new RouteError('MAP_DATA_UNAVAILABLE');
    });
    this.tiles.set(id, next);
    return next;
  }
}

export const canLoad = (point: Coordinate, index: TileIndex) => inBounds(point, index.bbox);
