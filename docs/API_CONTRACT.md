# API_CONTRACT - 빙빙제로

## 1. 목적

이 문서는 Worker proxy와 브라우저 `src/core` 사이의 계약을 정의한다. Worker는
외부 API 중계와 비밀 보호만 담당하며 경로 비교는 브라우저에서 실행한다. 필드의
의미를 변경하면 이 문서와 계약 테스트를 함께 갱신한다.

## 2. 공통 규칙

- 좌표는 WGS84 `[longitude, latitude]`다.
- 거리는 meter, 시간은 second다.
- 시간은 timezone을 포함한 ISO 8601이며 화면은 KST다.
- geometry는 GeoJSON을 사용한다.
- 누락값은 0으로 보충하지 않고 `null`과 상태를 함께 사용한다.
- API 키, 원시 강수량, 내부 위험 점수·임계값·특징값을 public response에 넣지 않는다.
- 실패한 geometry·거리·시간을 임의 생성하지 않는다.

## 3. Worker endpoint

### 3.1 장소 검색

```text
GET /api/places/search?q={keyword}&limit={1..10}
```

성공 응답:

```json
{
  "status": "success",
  "provider": "tmap",
  "queried_at": "2026-11-21T09:00:00+09:00",
  "places": [
    {
      "id": "provider-place-id",
      "name": "장소명",
      "address": "주소",
      "coordinates": [127.0, 37.5],
      "coordinate_source": "pedestrian_entrance"
    }
  ]
}
```

`coordinate_source`는 `pedestrian_entrance`, `entrance`, `center` 중 하나다.
검색 실패나 유효 좌표 부재 시 임의 좌표를 만들지 않는다.

### 3.2 시간별 기상

```text
GET /api/weather/hourly?lat={lat}&lon={lon}&selectedAt={iso}&mode={mode}
```

`mode`는 `current`, `forecast`, `historical_replay` 중 하나다. Worker는 승인된
Open-Meteo endpoint만 호출하고 내부 계산에 필요한 시간 범위를 정규화한다.

성공 응답의 내부 서비스 계약:

```json
{
  "status": "success",
  "provider": "open-meteo",
  "mode": "historical_replay",
  "location": { "coordinates": [127.0, 37.5] },
  "selected_at": "2026-02-02T13:00:00+09:00",
  "issued_at": null,
  "queried_at": "2026-11-21T09:00:00+09:00",
  "hours": [],
  "data_state": "HISTORICAL_REPLAY"
}
```

`hours`에는 `DATA_AND_AI.md`에서 승인한 필드만 정규화해 넣는다. 이 endpoint는
브라우저의 내부 분석 서비스만 호출하며 응답을 사용자 화면에 직접 출력하지 않는다.

### 3.3 P1 기상청 보강

```text
GET /api/kma/analysis
GET /api/kma/forecast
GET /api/kma/aws
```

P1 adapter가 구현될 때 요청·응답 스키마를 이 문서에 추가한다. endpoint 이름만
만들어 놓고 가짜 성공 응답을 반환하지 않는다.

## 4. 정적 보행 데이터 계약

```text
GET /data/seoul-walk/index.json
GET /data/seoul-walk/tiles/{tileId}.json
```

`index.json` 최소 필드:

```json
{
  "tile_format": 1,
  "source": "OpenStreetMap via Geofabrik",
  "source_url": "https://download.geofabrik.de/asia/south-korea-latest.osm.pbf",
  "source_as_of": "ISO-8601",
  "built_at": "ISO-8601",
  "bounds": [126.73, 37.39, 127.20, 37.72],
  "tile_size_degrees": 0.04,
  "tiles": [
    { "id": "tile-id", "path": "tiles/tile-id.json", "sha256": "hex", "bytes": 0 }
  ]
}
```

숫자 0은 구조 예시용 placeholder다. 실제 빌드값으로 교체한다. 해시나 타일 형식이
맞지 않으면 해당 타일을 사용하지 않고 `MAP_DATA_UNAVAILABLE`을 반환한다.

타일 최소 필드:

- `nodes`: OSM ID와 WGS84 좌표
- `edges`: 안정 간선 ID, from/to, way ID, 길이, 방향, 접근·계단·경사·교량 태그
- `buildings`: 닫힌 외곽선과 검증된 높이
- `metadata`: 타일 ID, 기준 시각, 라이선스

## 5. 브라우저 경로 비교 계약

HTTP endpoint가 아니라 `src/core`의 논리 계약이다.

```text
compareRoutes(request) -> RouteComparisonResult
```

요청:

```json
{
  "origin": { "label": "출발지", "coordinates": [127.0, 37.5] },
  "destination": { "label": "목적지", "coordinates": [127.01, 37.51] },
  "selected_at": "2026-02-02T13:00:00+09:00",
  "mode": "historical_replay"
}
```

위 좌표는 스키마 설명용이며 시연 좌표가 아니다.

성공 결과:

```json
{
  "request_id": "request-id",
  "status": "success",
  "mode": "historical_replay",
  "selected_at": "2026-02-02T13:00:00+09:00",
  "data_as_of": "2026-02-02T13:00:00+09:00",
  "data_state": "available",
  "baseline_route": {
    "edge_ids": [],
    "geometry": { "type": "LineString", "coordinates": [] },
    "distance_m": 0,
    "duration_seconds": 0
  },
  "recommended_route": {
    "status": "available",
    "edge_ids": [],
    "geometry": { "type": "LineString", "coordinates": [] },
    "distance_m": 0,
    "duration_seconds": 0,
    "additional_duration_seconds": 0
  },
  "risk_segments": [],
  "notices": [],
  "provenance": {
    "network_as_of": "ISO-8601",
    "risk_rule_version": "risk-rule-v1"
  }
}
```

예시의 빈 배열과 0은 스키마 placeholder다. 실제 성공 결과는 계산값을 사용한다.

### 5.1 경로 상태

`recommended_route.status`:

- `available`: 회피 조건을 만족하는 추천 경로가 있음
- `same_as_baseline`: 일반 경로에 회피 대상이 없어 동일함
- `unavailable`: 회피 후 그래프 연결이 끊김
- `not_evaluated`: 필요한 실제 기상·지도 자료가 부족함

`unavailable`과 `not_evaluated`에서는 geometry·거리·시간을 `null`로 둔다.

### 5.2 위험 구간

```json
{
  "segment_id": "edge-id",
  "geometry": { "type": "LineString", "coordinates": [] },
  "level": "expected",
  "label": "결빙 위험 예상구간",
  "data_state": "HISTORICAL_REPLAY"
}
```

원시 기상 수치, 내부 점수, 태양각, 건물 높이, 임계값을 포함하지 않는다.

## 6. 부분 결과 정책

기상 자료만 부족하고 보행 타일이 정상이라면 일반 경로는 표시할 수 있다.

- 전체 `status`: `partial`
- `baseline_route`: 실제 계산값
- `recommended_route.status`: `not_evaluated`
- `risk_segments`: 빈 배열
- notice: `WEATHER_DATA_MISSING`

이때 빈 위험 구간은 위험 없음이 아니라 평가하지 못했다는 뜻이다. UI에 자료 부족을
명확히 표시하고 추천 경로처럼 강조하지 않는다.

## 7. 오류 코드

| 상태 | 코드 | 의미 |
|---|---|---|
| 400 | `INVALID_INPUT` | 좌표·시각·검색어 형식 오류 |
| 400 | `OUTSIDE_SEOUL` | 서울 지원 범위 밖 |
| 422 | `NETWORK_SNAP_FAILED` | 80m 이내 보행 노드 연결 실패 |
| 422 | `SAME_NETWORK_NODE` | 두 장소가 같은 보행 노드에 연결됨 |
| 422 | `BASELINE_ROUTE_NOT_FOUND` | 일반 도보 경로 없음 |
| 200 | `RECOMMENDED_ROUTE_NOT_FOUND` | 일반 경로는 있으나 추천 경로 없음 |
| 503 | `MAP_DATA_UNAVAILABLE` | 타일 누락·해시·디코딩 실패 |
| 503 | `WEATHER_DATA_UNAVAILABLE` | 실제 기상 자료 실패·부족 |
| 503 | `UPSTREAM_UNAVAILABLE` | 외부 공급자 실패 |
| 500 | `ROUTE_CALCULATION_FAILED` | 내부 계산 실패 |

오류 body에는 사용자용 메시지와 재시도 가능 여부만 넣고 키·원본 stack을 넣지 않는다.

## 8. 보안과 캐시

- 비밀키는 Cloudflare Worker secrets에 둔다.
- 브라우저가 공급자 키나 임의 외부 URL을 Worker에 전달하지 못하게 한다.
- Worker는 host·path allowlist를 사용한다.
- `.env*`, `.dev.vars*`, 원본 응답 캐시는 커밋하지 않는다.
- TMAP 검색 결과는 허용 기간을 넘겨 저장하지 않는다.
- 위치·검색·경로 이력을 사용자 식별자와 연결해 저장하지 않는다.

## 9. 계약 검증

- 공급자 오류를 200 성공으로 위조하지 않는다.
- 실제 계산 없이 geometry·거리·시간을 반환하지 않는다.
- 일반·추천 경로의 간선 ID가 승인 보행 그래프에 존재한다.
- 추천 경로에 회피 간선이 없다.
- 두 경로가 같은 `1m/s` 시간 산식을 사용한다.
- `추가시간 = 추천시간 - 일반시간`이다.
- 자료 부족과 낮은 위험이 분리된다.
- public response와 UI에 내부 기상값·점수가 없다.
