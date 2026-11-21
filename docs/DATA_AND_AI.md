# DATA_AND_AI - 빙빙제로

## 1. 목적

이 문서는 승인된 데이터 공급자, 시간·결측 의미, `risk-rule-v1`을 정의한다.
빙빙제로의 P0 위험 추정은 학습된 AI 모델이 아니라 실제 기상과 공간 정보를
결합한 규칙 기반 계산이다. 화면에서 이를 검증된 AI 예측이라고 표현하지 않는다.

## 2. 비협상 원칙

- 핵심 기능과 시연에는 검증 가능한 실제 자료만 사용한다.
- 합성 온도·강수·적설·결빙값을 성공 시연에 사용하지 않는다.
- 과거 재생에는 출처·좌표·유효 시각·조회 시각을 표시한다.
- 누락을 0, 없음, 낮은 위험으로 바꾸지 않는다.
- 원본 단위와 시간 의미를 확인한 뒤 내부 표준으로 정규화한다.
- 내부 기상값·점수·임계값·가중치를 public response와 UI에 노출하지 않는다.
- 공급자 응답과 라이선스 조건을 기록한다.

## 3. 승인 데이터와 우선순위

| 용도 | 공급자·자료 | 우선순위 | 상태 | 사용 범위 |
|---|---|---:|---|---|
| 장소 검색 | TMAP POI 검색 | P0 | `APPROVED` | 장소명·주소·WGS84 좌표 |
| 보행망·건물 | Geofabrik South Korea OSM PBF | P0 | `APPROVED` | 서울 보행 그래프·건물 외곽선 |
| 지도 배경 | OpenStreetMap 타일 | P0 | `APPROVED` | Leaflet 배경 지도와 attribution |
| 현재·예보 | Open-Meteo Forecast API | P0 | `APPROVED` | 선택 정각과 직전 12시간 |
| 과거 재생 | Open-Meteo Historical Forecast API | P0 | `APPROVED` | 실제 과거 시간별 자료 |
| 고정 AIFS 재생 | Open-Meteo Single Runs, ECMWF AIFS | P0 시연 | `APPROVED` | 양재 2026-02-02 시나리오 |
| 상세 기온 보강 | 기상청 500m 분석 | P1 | `APPROVED-PENDING-ADAPTER` | 같은 정각 기온 우선 적용 |
| 단기 예보 보강 | 기상청 초단기·단기예보 | P1 | `APPROVED-PENDING-ADAPTER` | T1H/RN1, TMP/PCP, PTY |
| 관측 강수 보강 | 기상청 AWS | P1 | `APPROVED-PENDING-ADAPTER` | 3km 이내 실제 관측 |
| 지형 그늘 | Copernicus GLO-30 | P1 | `APPROVED-PENDING-ASSET` | 지형 가림 판정 |
| 서울시 자료 | 강우·제설·열선 공개자료 | P2 | `RESEARCH` | 보조 검증, P0 판정 대체 금지 |

승인 상태는 공급자의 역할을 뜻한다. 실제 endpoint가 호출되고 필수 필드가
검증되기 전에는 해당 어댑터를 `DONE` 처리하지 않는다.

## 4. 필요한 필드

### 4.1 장소·보행망

- 장소: 공급자, 장소 ID, 이름, 주소, WGS84 좌표, 좌표 종류, 조회 시각
- 노드: OSM ID, 좌표, 접근·장벽 태그
- 간선: 안정 ID, way ID, 순서, 길이, 방향, 보행 접근 상태, 형상
- 보조 태그: 계단, 경사, 램프, 교량, 실내, 터널, covered
- 건물: 닫힌 외곽선과 유효한 양수 높이

### 4.2 기상

P0 요청 필드는 다음과 같다.

- `temperature_2m`
- `precipitation`
- `snowfall`
- `snow_depth`
- `weather_code`
- `dew_point_2m`
- `wind_speed_10m`
- `shortwave_radiation`

각 값은 공급자, 좌표, 발행/모델 실행 시각, 유효 시각, 조회 시각, 단위,
현재·예보·과거 재생 상태를 함께 가진다.

## 5. 데이터 상태

| 상태 | 의미 |
|---|---|
| `OBSERVED` | 실제 관측 |
| `FORECAST` | 선택 시각에 적용되는 실제 예보 |
| `HISTORICAL_REPLAY` | 실제 과거 예보·관측 또는 명시한 과거 모델 실행 재생 |
| `MISSING` | 필요한 값이 없음 |
| `STALE` | 허용 갱신 시간을 넘김 |
| `FAILED` | 공급자·네트워크·정규화 실패 |

`MISSING`, `STALE`, `FAILED`는 정상적인 0이 아니다.

## 6. 시간 처리

- UI는 KST를 표시한다.
- 요청 시각, 데이터 발행 시각, 유효 시각, 조회 시각을 구분한다.
- 기본 선택은 현재 시간대의 정각이다.
- 미래 시각에는 미래 관측값을 사용하지 않는다.
- 과거 재생은 해당 과거 시각을 명시적으로 조회한 실제 자료만 사용한다.
- 시간별 강수는 해당 시각에 끝나는 직전 1시간 누적으로 해석한다.
- 직전 6시간은 선택 정각을 포함해 `t-5h`부터 `t`까지 6개 값이다.
- 과거 응답을 현재값처럼 재사용하지 않는다.

## 7. `risk-rule-v1`

### 7.1 출력

각 간선 또는 공간 구역은 다음 중 하나를 가진다.

- `RISK_EXPECTED`
- `NO_RISK_EVIDENCE`
- `UNKNOWN`

출력에는 데이터 상태, 계산 기준 시각, 규칙 버전, 내부 근거 참조를 포함한다.
`UNKNOWN`은 안전 또는 낮은 위험이 아니다.

### 7.2 재결빙 조건

다음 두 조건이 모두 확인될 때만 구역을 재결빙 조건으로 분류한다.

1. 선택 정각의 적용 기온이 `0°C 이하`
2. 직전 6시간에 실제 양의 강수 또는 강설 근거가 하나 이상 있음

P0 적용 기온은 Open-Meteo를 사용한다. P1이 완료되면 같은 정각의 유효한
기상청 500m 분석 → 초단기 → 단기 → Open-Meteo 순으로 선택한다.

확인된 0mm는 유효한 값이다. 필요한 6시간 값이 누락되고 다른 양의 물기 근거도
없으면 `UNKNOWN`이다. 일부 값이 누락되어도 확인된 양의 강수·강설이 있으면
물기 근거로 사용할 수 있으며 누락 상태는 메타데이터에 남긴다.

### 7.3 위험 간선

재결빙 조건이 성립한 구역에서 다음만 P0 위험 간선으로 표시한다.

- `bridge=yes` 등으로 확인된 실외 보행교
- 유효한 건물 높이와 태양 위치 계산으로 그늘이 확인된 실외 보행 조각이 걸린 간선

`covered=yes`, 실내, 터널, `location=underground`는 그늘 위험 판정에서 제외한다.
간선을 약 5m 조각으로 평가하되 추천 경로에서는 해당 간선 ID 전체를 제외한다.
건물 높이가 없거나 태양·교차 계산이 실패하면 해당 근거를 `UNKNOWN`으로 둔다.

### 7.4 지역 안내용 보조 상태

어는 비·이슬비 weather code, 서리 가능 조건, 잔류 결빙 가능성은 사용자용 짧은
안내에 사용할 수 있다. 이것만으로 간선을 회피 집합에 넣지 않는다. 원시 code와
수치는 UI에 표시하지 않는다.

## 8. 계단·경사 회피

결빙 위험과 별개로 추천 경로는 다음을 회피한다.

- `highway=steps`, `stairs=yes`, `steps=yes`, 양의 `step_count`
- 유효한 0이 아닌 `incline`
- `incline=up|down|up/down|down/up|yes`
- `footway=ramp`, `ramp=yes|wheelchair`

미기록은 평지나 계단 없음으로 간주하지 않는다. 다만 미기록만으로 간선을
제외하지도 않는다. 회피 이유는 사용자에게 `계단·경사 구간을 고려했어요`처럼
설명하고 원시 태그나 내부 목록은 표시하지 않는다.

## 9. 실제 과거 시연

확정된 기준 시나리오:

- ID: `S-01-YANGJAE-AIFS`
- 시각: `2026-02-02 13:00 KST`
- 출발지: `양재역 4번출구`
- 목적지: `양재동우체국`
- 자료: Open-Meteo Historical Forecast에서 조회한 ECMWF AIFS 시간별 예보
- 확인된 기상 근거: 기온 `-1.0°C`, 직전 6시간 강수 `0.2mm`, 양의 강설
- 주의: 위 수치는 내부 검증 기록에만 두고 사용자 UI에는 표시하지 않는다.

앱은 TMAP에서 시연 장소를 검색할 때 좌표를 받는다. 고정 재생에 필요한 9개 구역의
6시간 예보는 `public/data/weather/aifs-20260202.json`에 출처, 조회 시각, 라이선스와
함께 제공한다. 조회한 예보에서 필요한 필드만 선별했으며, 별도 SHA-256으로 검증한다.
정확한 시각·모델·요청 구역이 맞을 때만 보관 자료를 사용하고 그 외에는 API에 조회한다.
확인된 두 시연과 경로 검증 결과는 `TASKS.md`에 기록한다.

## 10. 내부·외부 정보 경계

### UI에 전달 가능

- 위험 예상구간과 개수
- 사용자용 짧은 위험 설명
- 자료 기준 시각
- 현재/예보/과거 재생 구분
- 자료 부족·갱신 실패 상태
- 추천 결과의 한계

### 내부에만 유지

- 원시 기온·강수·강설·적설 값
- weather code와 공급자 fallback 세부정보
- 내부 점수·임계값·특징값
- 타일 캐시 키와 원본 API 응답
- 건물 높이·태양각·교차 계산값

## 11. 캐시와 보존

- 동일 구역의 동시 요청은 하나로 합칠 수 있다.
- 최신 예보 캐시는 15분 단위 갱신을 기본으로 하며 실제 공급자 갱신 시각을 기록한다.
- TMAP 응답은 약관상 허용된 보존 기간을 넘기지 않는다.
- 고정 과거 자료를 저장할 때 원출처, 요청 좌표·기간·모델, 조회 시각, 라이선스,
  SHA-256을 함께 기록한다.
- API 키와 민감 원본 응답은 저장소에 커밋하지 않는다.

## 12. 검증 기준

- 각 실제 입력의 공급자·좌표·기준 시각·상태를 추적할 수 있다.
- 같은 시나리오와 데이터 버전에서 같은 위험 집합이 나온다.
- 합성 기상값이 핵심 흐름에 없다.
- 결측이 낮은 위험으로 바뀌지 않는다.
- 공급자 실패 시 가짜 정상 응답을 만들지 않는다.
- 사용자 응답과 UI에 내부 계산값이 없다.

## 13. 공식 참고 자료

- TMAP API 약관·제공 기능: <https://tmapapi.tmapmobility.com/terms.html>
- Geofabrik South Korea OSM PBF: <https://download.geofabrik.de/asia/south-korea.html>
- OpenStreetMap 저작권·ODbL 표시: <https://www.openstreetmap.org/copyright>
- Open-Meteo Forecast API: <https://open-meteo.com/en/docs>
- Open-Meteo Historical Forecast API: <https://open-meteo.com/en/docs/historical-forecast-api>
- Open-Meteo Single Runs API: <https://open-meteo.com/en/docs/single-runs-api>
