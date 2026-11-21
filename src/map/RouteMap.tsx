import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinate, Place, RouteComparison } from '../core/contracts';

interface Props {
  origin: Place | null;
  destination: Place | null;
  result?: RouteComparison | null;
  onPick?: (coordinates: Coordinate) => void;
  location?: Coordinate | null;
  onLocate?: () => void;
  locating?: boolean;
  selected?: 'safe' | 'normal';
}

const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const latLng = ([x, y]: Coordinate): L.LatLngTuple => [y, x];

const pin = (type: 'start' | 'destination' | 'risk', text: string) => L.divIcon({
  className: `marker marker--${type}`, html: `<span aria-hidden="true">${text}</span>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
});

function label(text: string) {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
}

export function RouteMap({ origin, destination, result, onPick, location, onLocate, locating, selected = 'safe' }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const locationMarker = useRef<L.CircleMarker | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView([37.5665, 126.978], 12);
    instance.attributionControl.setPrefix(false);
    const tiles = L.tileLayer(tileUrl, {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors (ODbL)</a>',
    }).addTo(instance);
    tiles.on('tileerror', () => setTilesFailed(true));
    tiles.on('load', () => {
      if (tiles.getContainer()?.querySelector('.leaflet-tile-loaded')) setTilesFailed(false);
    });
    instance.on('click', (event: L.LeafletMouseEvent) => pickRef.current?.([event.latlng.lng, event.latlng.lat]));
    layer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; layer.current = null; locationMarker.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    locationMarker.current?.remove();
    locationMarker.current = null;
    if (!location) return;
    const position = latLng(location);
    locationMarker.current = L.circleMarker(position, {
      radius: 9, color: '#FFFFFF', weight: 4, fillColor: '#1F83FF', fillOpacity: 1, interactive: false,
    }).addTo(instance);
    instance.setView(position, Math.max(instance.getZoom(), 16), { animate: false });
  }, [location]);

  useEffect(() => {
    const instance = map.current, group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    const points: L.LatLngTuple[] = [];
    const drawRoute = (coordinates: Coordinate[], name: string, color: string, weight: number, dashArray?: string) => {
      const line = coordinates.map(latLng);
      for (const point of line) points.push(point);
      L.polyline(line, { color: '#FFFFFF', weight: weight + 4, interactive: false }).addTo(group);
      L.polyline(line, { color, weight, dashArray }).addTo(group).bindTooltip(label(name));
    };
    if (result) {
      const normal = () => drawRoute(result.baseline.coordinates, '일반 경로', '#65778A', selected === 'normal' ? 6 : 4, '8 7');
      const safe = () => {
        if (result.recommendation.route) drawRoute(result.recommendation.route.coordinates, '안전 경로', '#1F83FF', selected === 'safe' ? 8 : 6);
      };
      if (result.recommendation.status === 'same_as_baseline') {
        if (selected === 'normal') normal();
        else safe();
      } else if (selected === 'normal') {
        safe();
        normal();
      } else {
        normal();
        safe();
      }
      for (const [index, segment] of result.riskSegments.entries()) {
        const [a, b] = segment.geometry;
        L.polyline([latLng(a), latLng(b)], { color: '#FFFFFF', weight: 10, interactive: false }).addTo(group);
        L.polyline([latLng(a), latLng(b)], { color: '#006DB3', weight: 7, dashArray: '3 7' })
          .addTo(group).bindTooltip(label('결빙 위험 예상구간'));
        if (index < 8) {
          L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], {
            icon: pin('risk', '❄'), keyboard: false, interactive: false,
          }).addTo(group);
        }
      }
    }
    for (const [place, type, caption] of [[origin, 'start', '출발지'], [destination, 'destination', '목적지']] as const) {
      if (!place) continue;
      const position = latLng(place.coordinates);
      points.push(position);
      L.marker(position, { icon: pin(type, type === 'start' ? '●' : '◆'), title: `${caption} · ${place.name}` })
        .addTo(group).bindTooltip(label(`${caption} · ${place.name}`));
    }
    if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 18, animate: false });
    else if (points.length === 1) instance.setView(points[0], 16, { animate: false });
  }, [origin, destination, result, selected]);

  return <div className={`map-frame${onPick ? ' map-frame--select' : ''}`}>
    <div className="map" ref={container} aria-label="서울 도보 경로 지도" />
    <div className="map-controls" role="group" aria-label="지도 조작">
      {onLocate && <button type="button" aria-label="지도에서 현재 위치 보기" disabled={locating} onClick={onLocate}>
        <span className="location-glyph" aria-hidden="true" />
      </button>}
      <button type="button" aria-label="지도 확대" onClick={() => map.current?.zoomIn(1)}>+</button>
      <button type="button" aria-label="지도 축소" onClick={() => map.current?.zoomOut(1)}>−</button>
    </div>
    <p role="status" className="sr-only">{location ? '현재 위치를 지도에 표시했어요.' : ''}</p>
    {tilesFailed && <p role="status" className="map-notice">배경 지도를 불러오지 못했어요. {result ? '아래에서 경로 요약을 확인할 수 있어요.' : '장소를 검색할 수 있어요.'}</p>}
  </div>;
}
