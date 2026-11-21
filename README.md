# 빙빙제로

서울 전역의 실제 기상·공간 데이터를 바탕으로 결빙 위험 예상 구간을 표시하고,
일반 도보 경로와 위험·계단·경사 구간을 회피하는 추천 도보 경로, 예상 추가
소요시간을 비교하는 6시간 해커톤 프로젝트다.

## 핵심 사용자 경험

1. 사용자가 서울 안의 출발지와 목적지를 선택한다.
2. 서비스가 보행 허용 네트워크에서 일반 도보 경로를 계산한다.
3. 선택 시각의 실제 기상·공간 자료를 바탕으로 결빙 위험 예상 구간을 구한다.
4. 결빙·계단·경사 구간을 고려한 추천 도보 경로를 계산한다.
5. 사용자는 지도에서 두 경로와 추가 예상시간을 비교한다.

## 반드시 지킬 기준

- 합성 데이터로 핵심 기능을 시연하지 않는다.
- 실제 과거 예보·관측 재생은 출처와 기준 시각을 표시한다.
- 보행이 허용되지 않은 차도는 추천 경로에서 제외한다.
- 강수량·내부 결빙 점수·임계값을 사용자 UI에 노출하지 않는다.
- 일부 지역만 하드코딩하지 않고 서울 전역을 지원한다.
- `DESIGN.md`가 제공되면 그 화면과 정보 구조를 그대로 따른다.

## 문서 구조

| 문서 | 역할 |
|---|---|
| `AGENTS.md` | 코딩 에이전트의 작업·검증·커밋·푸시 규칙 |
| `docs/PRD.md` | 제품 범위, 사용자 흐름, 요구사항 |
| `docs/DESIGN.md` | Material 3 UI, 색상, 화면 구조, 접근성 기준 |
| `docs/ARCHITECTURE.md` | 시스템 책임 경계와 데이터 흐름 |
| `docs/DATA_AND_AI.md` | 데이터 출처 상태, 위험 계산, 결측 규칙 |
| `docs/API_CONTRACT.md` | 프론트엔드와 서버 사이의 논리 계약 |
| `docs/TASKS.md` | 6시간 실행 순서, 결정 사항, 시연 시나리오 |
| `docs/TESTING.md` | 인수 기준과 실패 방지 검증 |

## 현재 결정 상태

- 제품 범위: 서울 전역, 도보 경로, 로그인 없음
- 데이터 원칙: 실제 데이터만 사용, 실제 과거 자료 재생 허용
- UI: `docs/DESIGN.md` 확정, responsive web Material 3로 구현
- 웹: React 19 + TypeScript + Vite
- 지도: Leaflet + OpenStreetMap
- 비밀키 중계: Cloudflare Worker
- 장소 검색: TMAP
- 경로: Geofabrik South Korea PBF에서 만든 서울 OSM 보행 타일 + 브라우저 Dijkstra
- 기상 P0: Open-Meteo Forecast/Historical Forecast, 실제 과거 AIFS 시나리오
- 위험 계산: 학습 모델이 아닌 규칙 기반 계산
- 기상청 500m·예보, AWS, 지형 그늘: P0 완료 후 보강

## 로컬 실행

Node.js 22.12 이상, Python 3, curl을 사용합니다. 팀에서 받은 `staticdata/.env.local`은
작업 환경에 보관합니다. 장소 검색에 필요한 변수는 `TMAP_APP_KEY`입니다.
`npm run dev`는 `.dev.vars` 또는 `staticdata/.env.local`에서 이 변수를 읽습니다.

```text
npm ci
npm run data:build
npm run dev
```

`npm run dev`가 표시하는 로컬 주소에서 앱을 열고 **양재 시연 열기**를 선택하세요.
장소 검색과 현재 기상은 인터넷 연결을 사용합니다. 내장 시연은 보관된 실제 과거
예보를 재생합니다. 보행망 108개 타일과 행정 경계는 저장소에 포함되어 있습니다.

`npm run dev`는 로컬에서 같은 Worker API 처리기를 Node로 실행합니다.
`npm run dev:worker`는 Cloudflare 모의 런타임을 실행하며 `.dev.vars`가 필요합니다.
Cloudflare에 배포할 때는 `npm run build`가 만든 Worker 구성을 사용하고
`TMAP_APP_KEY`는 Cloudflare Worker 비밀값으로 등록합니다.

Azure App Service에 배포할 때는 `npm run build:azure`로 `dist/azure-app`을
만듭니다. Node.js 22에서 `node server.mjs`로 실행하며, 같은 HTTPS 주소에서
정적 화면과 `/api/*`를 제공합니다. `TMAP_APP_KEY`는 App Service의 서버 환경
변수로 설정합니다.

```text
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
LIVE_DEMO_TEST=1 npm run test:e2e
npm run check:secrets
```

정적 보행 데이터의 라이선스는 [DATA-NOTICES.md](DATA-NOTICES.md)에 있습니다.

## 해커톤 운영

`docs/TASKS.md`의 작업 ID 하나를 선택해 구현·검증한 뒤 기능 단위로 커밋하고
현재 작업 브랜치에 푸시한다. 커밋·푸시 세부 규칙은 `AGENTS.md`를 따른다.

