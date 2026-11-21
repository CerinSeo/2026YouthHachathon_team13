export type Coordinate = readonly [longitude: number, latitude: number];
export type Mode = 'current' | 'forecast' | 'historical_replay';

export interface Place {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinate;
  coordinate_source: 'pedestrian_entrance' | 'entrance' | 'center' | 'device' | 'map';
}

export interface WeatherHour {
  valid_at: string;
  temperature_c: number | null;
  precipitation_mm: number | null;
  snowfall_cm: number | null;
}

export interface WeatherSeries {
  provider: 'open-meteo';
  model: 'best_match' | 'ecmwf_aifs025_single';
  location: { coordinates: Coordinate };
  mode: Mode;
  selected_at: string;
  issued_at: null;
  queried_at: string;
  hours: WeatherHour[];
  data_state: 'HISTORICAL_REPLAY' | 'FORECAST';
}

export interface RouteRequest {
  origin: Place;
  destination: Place;
  selectedAt: string;
  mode: Mode;
  model?: WeatherSeries['model'];
}

export interface WalkingRoute {
  edgeIds: string[];
  coordinates: Coordinate[];
  distanceM: number;
  durationSeconds: number;
  turns: { direction: 'left' | 'right'; coordinates: Coordinate }[];
}

export interface RiskSegment {
  edgeId: string;
  geometry: [Coordinate, Coordinate];
}

export type Recommendation =
  | { status: 'available' | 'same_as_baseline'; route: WalkingRoute; additionalSeconds: number }
  | { status: 'unavailable' | 'not_evaluated'; route: null; additionalSeconds: null };

export interface RouteComparison {
  baseline: WalkingRoute;
  recommendation: Recommendation;
  riskSegments: RiskSegment[];
  dataAsOf: string | null;
  networkAsOf: string;
  mode: Mode;
  selectedAt: string;
  model: WeatherSeries['model'];
  riskRuleVersion: 'risk-rule-v1';
  reason?: 'missing' | 'weather_failed' | 'constraints';
  unmappedAccessFeatures: boolean;
}

export type RouteErrorCode = 'OUTSIDE_SEOUL' | 'NETWORK_SNAP_FAILED' | 'SAME_NETWORK_NODE'
  | 'BASELINE_ROUTE_NOT_FOUND' | 'MAP_DATA_UNAVAILABLE';

export class RouteError extends Error {
  constructor(readonly code: RouteErrorCode) {
    super(code);
  }
}
