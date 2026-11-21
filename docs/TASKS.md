# TASKS - 6시간 해커톤 실행 계획

## 1. 운영 원칙

- 기술 구조와 공급자 역할은 이미 결정되었다. 첫 30분을 재논의에 쓰지 않는다.
- P0 종단 흐름을 먼저 완성한다.
- 하나의 작업 ID를 구현·검증한 뒤 기능 단위로 커밋하고 푸시한다.
- `DESIGN.md`의 구조·토큰·접근성을 임의 변경하지 않는다.
- 합성 기상·결빙 데이터로 성공 시연을 만들지 않는다.
- P1·P2 때문에 P0를 늦추지 않는다.
- 블로커가 15분 이상 지속되면 원인·영향·대안을 기록하고 다음 P0로 이동한다.

## 2. 완료 상태

```text
TODO → IN_PROGRESS → BLOCKED 또는 DONE
```

`DONE`은 코드, 관련 테스트, 문서 갱신, 기능 단위 커밋과 푸시가 모두 끝난 상태다.

## 3. 확정 결정

| ID | 결정 | 최종값 | 상태 |
|---|---|---|---|
| `D-001` | 프론트엔드 | React 19 + TypeScript + Vite | `DECIDED` |
| `D-002` | API 중계 | Cloudflare Worker, secrets 사용 | `DECIDED` |
| `D-003` | 지도 | Leaflet + OpenStreetMap | `DECIDED` |
| `D-004` | 장소 검색 | TMAP POI, 경로 계산에는 사용하지 않음 | `DECIDED` |
| `D-005` | 보행 네트워크 | Geofabrik South Korea PBF → 서울 OSM 보행 타일 | `DECIDED` |
| `D-006` | 경로 엔진 | 브라우저 `src/core`, 동일 그래프 Dijkstra | `DECIDED` |
| `D-007` | P0 기상 | Open-Meteo Forecast + Historical Forecast/Single Run | `DECIDED` |
| `D-008` | 위험 규칙 | `0°C 이하` + 직전 6시간 양의 수분 근거 + 그늘/보행교 | `DECIDED` |
| `D-009` | 회피 방식 | 결빙·계단·경사 간선 명시적 제외 | `DECIDED` |
| `D-010` | 보행속도 | 일반·추천 모두 `1m/s` | `DECIDED` |
| `D-011` | 부분 결과 | 기상 부족 시 일반 경로만 표시, 추천은 평가 보류 | `DECIDED` |
| `D-012` | UI | `DESIGN.md` responsive web Material 3 | `DECIDED` |
| `D-013` | 학습 모델 | 사용하지 않음, 규칙 기반이라고 명시 | `DECIDED` |
| `D-014` | P0 제외 기능 | 로그인·최근 검색·즐겨찾기·turn-by-turn | `DECIDED` |

이 표를 구현 중 임의 변경하지 않는다. 변경이 필요하면 제품 책임자의 승인과
관련 문서·테스트 갱신을 먼저 수행한다.

## 4. 6시간 타임라인

| 시간 | 목표 | 종료 조건 |
|---|---|---|
| 00:00-00:20 | 저장소·스크립트·Worker 초기화 | npm 명령 실행, secrets 누락 오류 확인 |
| 00:20-01:10 | 서울 보행 타일 빌드 | PBF 다운로드·필터·index/hash·샘플 타일 검증 |
| 01:10-02:00 | 장소 검색과 일반 경로 | TMAP 검색, 서울 검증, 스냅, 실제 일반 경로 |
| 02:00-03:00 | 실제 기상과 위험 구간 | 과거 AIFS 자료로 `risk-rule-v1` 위험 간선 산출 |
| 03:00-03:45 | 추천 경로와 시간 비교 | 회피 후 Dijkstra, 후검증, 추가시간 계산 |
| 03:45-04:45 | 승인 UI 통합 | 검색·확인·결과·자료 부족 화면 동작 |
| 04:45-05:30 | 시나리오·서울 범위 검증 | S-01과 다른 생활권 후보 검증, walk-only 확인 |
| 05:30-06:00 | 오류 복구·최종 시연 | P0 체크, 접근성 핵심 QA, 실행 안내 완료 |

## 5. P0 작업 목록

| ID | 작업 | 의존성 | 완료 조건 | 커밋 예시 | 상태 |
|---|---|---|---|---|---|
| `T-001` | 저장소와 실행 명령 | 없음 | install/dev/lint/typecheck/test/build가 실제 동작 | `chore(repo): initialize hackathon workspace` | TODO |
| `T-002` | Worker와 secrets 구조 | T-001 | 키 비노출, 누락·timeout·공급자 오류 구분 | `chore(worker): configure external API proxy` | TODO |
| `T-003` | 서울 보행 타일 빌드 | T-001 | PBF 출처·시각·index·SHA-256과 타일 생성 | `feat(data): build Seoul walking tiles` | TODO |
| `T-004` | 타일 로더·그래프 | T-003 | 해시 검증, 중복 제거, 방향·접근 태그 보존 | `feat(graph): load verified walking tiles` | TODO |
| `T-005` | TMAP 장소 검색 | T-002 | 실제 장소·입구 좌표, 실패 시 임의 좌표 없음 | `feat(search): add TMAP place search` | TODO |
| `T-006` | 서울 범위·80m 스냅 | T-004,T-005 | 안/밖·스냅 실패·같은 노드 상태 구분 | `feat(input): validate and snap route endpoints` | TODO |
| `T-007` | 일반 Dijkstra 경로 | T-004,T-006 | 실제 서울 좌표, 간선 ID·형상·거리·시간 | `feat(route): compute baseline walking route` | TODO |
| `T-008` | 실제 기상 어댑터 | T-002 | 현재·과거 자료, 출처·유효 시각·결측 상태 | `feat(weather): load real hourly weather` | TODO |
| `T-009` | 건물 그늘·보행교 | T-004,T-008 | 검증 가능한 공간 근거만 위험 후보로 사용 | `feat(risk): detect exposed bridge and shade edges` | TODO |
| `T-010` | `risk-rule-v1` | T-008,T-009 | 0°C·6시간 수분·UNKNOWN 규칙 테스트 | `feat(risk): classify icing expected edges` | TODO |
| `T-011` | 계단·경사 회피 집합 | T-004 | 미기록/없음 구분, 태그 규칙 테스트 | `feat(route): identify step and incline edges` | TODO |
| `T-012` | 추천 경로 | T-007,T-010,T-011 | 회피 간선 제외, 연결 실패, 후검증 | `feat(route): compute recommended walking route` | TODO |
| `T-013` | 비교 계약 | T-007,T-012 | 동일 1m/s 산식, 추가시간, 부분 결과 | `feat(core): assemble route comparison result` | TODO |
| `T-014` | 디자인 토큰·기본 화면 | T-001 | DESIGN HEX·타입·48dp·큰 글자 구조 적용 | `feat(ui): add accessible Material 3 shell` | TODO |
| `T-015` | 지도·결과 UI | T-013,T-014 | 일반·추천·위험을 색+선+문구로 구분 | `feat(ui): render route comparison map` | TODO |
| `T-016` | 오류·자료 부족 UI | T-013,T-014 | 입력·지역 밖·자료 부족·추천 없음 구분 | `feat(ui): handle route result states` | TODO |
| `T-017` | S-01 고정 시연 | T-005~T-016 | 좌표·데이터·보행망 버전 고정, 우회 효과 확인 | `test(demo): verify Yangjae historical scenario` | TODO |
| `T-018` | 서울 복수 생활권 검증 | T-012 | 후보 2곳 이상 동일 규칙, 차도 혼입 없음 | `test(route): verify Seoul-wide walking routes` | TODO |
| `T-019` | 종단·접근성 핵심 QA | T-015~T-018 | TESTING 최종 체크와 시연 순서 완료 | `test(e2e): verify hackathon demo flow` | TODO |

## 6. P1·P2

### P1 - P0 완료 후

- 기상청 500m 분석·초단기·단기 adapter와 우선순위
- AWS 3km 강수 보강
- Copernicus GLO-30 지형 가림
- 고대비 옵션과 키보드·스크린리더 세부 QA
- 정적 타일 압축과 로딩 성능 개선

### P2 - 시간 여유가 있을 때

- 서울시 강우·제설·열선 자료 교차 검증
- 최신 예보 캐시·동시 요청 병합
- 운영 모니터링과 배포 자동화

로그인, 이동 이력, 즐겨찾기, 최근 검색, turn-by-turn은 해커톤 P0가 아니다.

## 7. 실제 과거 시연 시나리오

| ID | 이용 목적 | KST 시각 | 출발지 | 목적지 | 상태 |
|---|---|---|---|---|---|
| `S-01-YANGJAE-AIFS` | 정류장 간 보행 이동 | 2026-02-02 13:00 | 양재역7번출구.한신휴플러스 정류장 | 양재역스포타임앞 정류장 | `FIXED-WEATHER / ROUTE-REVERIFY` |
| `S-02-HOSPITAL` | 지하철역 → 병원 | 2026-02-02 13:00 | 혜화역 3번 출구 | 서울대학교병원 본관 | `CANDIDATE` |
| `S-03-WELFARE` | 지하철역 → 복지시설 | 2026-02-02 13:00 | 공덕역 2번 출구 | 마포노인종합복지관 | `CANDIDATE` |

S-01은 실제 AIFS 기상 조건이 확인된 기준 시나리오다. 새로 만든 보행 타일과
TMAP 좌표로 경로·회전·회피 효과를 다시 확인해야 `VERIFIED`가 된다. S-02와 S-03은
실제 이용성이 있는 고정 장소 후보이며 다음을 모두 통과해야만 시연에 사용한다.

- TMAP에서 유효한 출입구·장소 좌표 확보
- 출발지·목적지가 서로 다른 보행 노드에 연결
- 좌회전 또는 우회전 한 번 이상
- 모든 간선이 승인 보행 way
- 선택 시각의 실제 기상 자료 확보
- 최소 하나의 시나리오에서 위험 반영 전후 경로 차이

검증 후 정확한 좌표, 공급자 조회 시각, 보행망 기준 시각, 결과를 이 표 아래에
기록한다. 검증 실패 시 다른 실제 장소로 교체하되 성공 결과를 만들기 위해 좌표나
기상값을 조작하지 않는다.

## 8. 블로커와 전환 기준

| 시각 | 작업 ID | 블로커 | 영향 | 대안/결정 | 상태 |
|---|---|---|---|---|---|
| | | | | | |

- PBF 다운로드·빌드가 50분을 넘으면 원인을 기록하고 필터 범위·출력 크기부터 줄인다.
- 공개 Overpass 전체 서울 조회를 P0 대안으로 사용하지 않는다.
- 공급자 장애 시 캐시를 현재값으로 위장하지 않는다.
- 특정 시나리오가 실패해도 서울 공통 로직을 해당 장소에 맞춰 하드코딩하지 않는다.
- 기술 구조를 TMAP 경로나 OpenRouteService로 바꾸려면 제품 책임자 승인이 필요하다.

## 9. 최종 체크

- [ ] P0 작업 완료
- [ ] 기능 단위 커밋과 푸시 완료
- [ ] 비밀키·원본 민감 응답·원본 PBF 미커밋
- [ ] 타일 출처·기준 시각·SHA-256 확인
- [ ] 실제 데이터 출처·유효 시각 확인
- [ ] 일반·추천 경로 동일 보행 그래프 확인
- [ ] 자동차 전용·보행 금지·임의 직선 간선 0개
- [ ] 추천 경로 회피 간선 0개
- [ ] 서울 복수 생활권 검증
- [ ] 승인 디자인·접근성 핵심 기준 확인
- [ ] 내부 지표 UI 비노출
- [ ] 실제 과거 시나리오 재현
- [ ] 실패·미실행 테스트 보고
