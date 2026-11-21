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
| `T-001` | 저장소와 실행 명령 | 없음 | install/dev/lint/typecheck/test/build가 실제 동작 | `chore(repo): initialize hackathon workspace` | DONE |
| `T-002` | Worker와 secrets 구조 | T-001 | 키 비노출, 누락·timeout·공급자 오류 구분 | `chore(worker): configure external API proxy` | DONE |
| `T-003` | 서울 보행 타일 빌드 | T-001 | PBF 출처·시각·index·SHA-256과 타일 생성 | `feat(data): build Seoul walking tiles` | DONE |
| `T-004` | 타일 로더·그래프 | T-003 | 해시 검증, 중복 제거, 방향·접근 태그 보존 | `feat(graph): load verified walking tiles` | DONE |
| `T-005` | TMAP 장소 검색 | T-002 | 실제 장소·입구 좌표, 실패 시 임의 좌표 없음 | `feat(search): add TMAP place search` | DONE |
| `T-006` | 서울 범위·80m 스냅 | T-004,T-005 | 안/밖·스냅 실패·같은 노드 상태 구분 | `feat(input): validate and snap route endpoints` | DONE |
| `T-007` | 일반 Dijkstra 경로 | T-004,T-006 | 실제 서울 좌표, 간선 ID·형상·거리·시간 | `feat(route): compute baseline walking route` | DONE |
| `T-008` | 실제 기상 어댑터 | T-002 | 현재·과거 자료, 출처·유효 시각·결측 상태 | `feat(weather): load real hourly weather` | DONE |
| `T-009` | 건물 그늘·보행교 | T-004,T-008 | 검증 가능한 공간 근거만 위험 후보로 사용 | `feat(risk): detect exposed bridge and shade edges` | DONE |
| `T-010` | `risk-rule-v1` | T-008,T-009 | 0°C·6시간 수분·UNKNOWN 규칙 테스트 | `feat(risk): classify icing expected edges` | DONE |
| `T-011` | 계단·경사 회피 집합 | T-004 | 미기록/없음 구분, 태그 규칙 테스트 | `feat(route): identify step and incline edges` | DONE |
| `T-012` | 추천 경로 | T-007,T-010,T-011 | 회피 간선 제외, 연결 실패, 후검증 | `feat(route): compute recommended walking route` | DONE |
| `T-013` | 비교 계약 | T-007,T-012 | 동일 1m/s 산식, 추가시간, 부분 결과 | `feat(core): assemble route comparison result` | DONE |
| `T-014` | 디자인 토큰·기본 화면 | T-001 | DESIGN HEX·타입·48dp·큰 글자 구조 적용 | `feat(ui): add accessible Material 3 shell` | DONE |
| `T-015` | 지도·결과 UI | T-013,T-014 | 일반·추천·위험을 색+선+문구로 구분 | `feat(ui): render route comparison map` | DONE |
| `T-016` | 오류·자료 부족 UI | T-013,T-014 | 입력·지역 밖·자료 부족·추천 없음 구분 | `feat(ui): handle route result states` | DONE |
| `T-017` | S-01 고정 시연 | T-005~T-016 | 좌표·데이터·보행망 버전 고정, 우회 효과 확인 | `test(demo): verify Yangjae historical scenario` | DONE |
| `T-018` | 서울 복수 생활권 검증 | T-012 | 후보 2곳 이상 동일 규칙, 차도 혼입 없음 | `test(route): verify Seoul-wide walking routes` | DONE |
| `T-019` | 종단·접근성 핵심 QA | T-015~T-018 | TESTING 최종 체크와 시연 순서 완료 | `test(e2e): verify hackathon demo flow` | IN_PROGRESS |

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

### 후속 작업

| ID | 작업 | 검증 기준 | 상태 |
|---|---|---|---|
| `T-020` | 브라우저 한국어 TTS와 진동 경로 안내 | 선택 경로의 단계 재생, 현재 위치·권한 실패 처리, 지원 여부에 따른 화면 안내, 종료 시 감시 정리 | DONE |
| `T-021` | 자주 다니는 길 잠금화면 결빙 웹 푸시 | 기기 권한, 즉시 시험, 서버의 10분 간격 발송, 끄기, 양재의 실제 과거 기상 결과로 직접 이동 | DONE |

## 7. 실제 과거 시연 시나리오

| ID | 이용 목적 | KST 시각 | 출발지 | 목적지 | 상태 |
|---|---|---|---|---|---|
| `S-01-YANGJAE-AIFS` | 지하철역 → 우체국 | 2026-02-02 13:00 | 양재역 4번 출구 | 양재동우체국 | `VERIFIED` |
| `S-02-HOSPITAL` | 지하철역 → 병원 출입구 | 2026-02-02 13:00 | 혜화역 3번 출구 | 서울대학교병원 동문 | `VERIFIED` |
| `S-03-CITY-HALL` | 지하철역 → 공공광장 | 2026-02-02 13:00 | 시청역 5번 출구 | 서울광장 | `VERIFIED` |

보행망 기준은 `2026-11-17T21:24:30Z`다. 세 시연 모두 TMAP으로 장소를 조회하고
동일한 실데이터 보행망과 AIFS 예보를 적용했다.

- 양재 일반 경로 약 342m, 안전 경로 약 438m. 결빙 위험 예상구간 1곳과 우회,
  일반 경로 4회 및 안전 경로 5회 방향 전환을 확인했다.
- 혜화 경로 약 217m에 방향 전환 6회, 시청 경로 약 104m에 방향 전환 1회를
  확인했다. 이 시각 두 생활권에서는 일반 경로와 안전 경로가 같다.
- 종전 양재 정류장 예시는 현재 보행망에서 우회를 재현할 수 없어 우체국이
  목적지인 시연으로 바꾸었다.

시연을 변경할 때는 다음 기준을 적용한다.

- TMAP에서 유효한 출입구·장소 좌표 확보
- 출발지·목적지가 서로 다른 보행 노드에 연결
- 좌회전 또는 우회전 한 번 이상
- 모든 간선이 승인 보행 way
- 선택 시각의 실제 기상 자료 확보
- 최소 하나의 시나리오에서 위험 반영 전후 경로 차이

재검증 후 공급자 조회 시각, 보행망 기준 시각과 경로 결과를 기록한다. 앱은 장소
좌표를 실시간으로 다시 검색한다.

## 8. 블로커와 전환 기준

| 시각 | 작업 ID | 블로커 | 영향 | 대안/결정 | 상태 |
|---|---|---|---|---|---|
| 2026-11-21 KST | T-002 | Cloudflare 런타임이 `redirect: 'error'`를 거부함 | Worker에서 공급자 호출 실패 | `redirect: 'manual'`과 상태 코드 검사 적용 후 실제 TMAP·Open-Meteo 응답 확인 | 해결 |
| 2026-11-21 KST | T-019 | Android 실기기 확인 미실행 | TalkBack·Switch Access 실기기 검증 미확인 | Chromium 키보드 포커스 및 모바일 200% 글자 크기 확인 | 실기기 미실행 |

- PBF 다운로드·빌드가 50분을 넘으면 원인을 기록하고 필터 범위·출력 크기부터 줄인다.
- 공개 Overpass 전체 서울 조회를 P0 대안으로 사용하지 않는다.
- 공급자 장애 시 캐시를 현재값으로 위장하지 않는다.
- 특정 시나리오가 실패해도 서울 공통 로직을 해당 장소에 맞춰 하드코딩하지 않는다.
- 기술 구조를 TMAP 경로나 OpenRouteService로 바꾸려면 제품 책임자 승인이 필요하다.

## 9. 최종 체크

- [ ] P0 작업 완료
- [x] 초기 설정·정적 데이터·시연 데이터·앱 구현을 기능 단위로 커밋하고 푸시
- [x] 비밀키·원본 민감 응답·원본 PBF 미커밋
- [x] 타일 출처·기준 시각·SHA-256 확인
- [x] 실제 데이터 출처·유효 시각 확인
- [x] 일반·추천 경로 동일 보행 그래프 확인
- [x] 자동차 전용·보행 금지·임의 직선 간선 0개
- [x] 추천 경로 회피 간선 0개
- [x] 서울 복수 생활권 검증
- [x] 승인 디자인과 웹 키보드·확대 기준 확인
- [x] 내부 지표 UI 비노출
- [x] 실제 과거 시나리오 재현
- [x] 실패·미실행 테스트 보고
