# 빙빙제로

서울 전역의 실제 기상·공간 데이터를 바탕으로 결빙 위험 예상 구간을 표시하고,
일반 도보 경로와 위험·계단·경사 구간을 회피하는 추천 도보 경로, 예상 추가
소요시간을 비교하는 6시간 해커톤 프로젝트다.

## 기술 스택

| 영역 | 기술 | 적용 범위 |
|---|---|---|
| 프론트엔드 | React 19, TypeScript, Vite | Material 3 기반 반응형 웹 UI |
| 지도·장소 검색 | Leaflet, OpenStreetMap, TMAP POI API | 지도와 경로 표시, 장소·출입구 검색 |
| 기상 데이터 | Open-Meteo Forecast·Historical Forecast API, ECMWF AIFS | 현재 기상 조회와 실제 과거 예보 재생 |
| 서울 보행망 | Geofabrik의 한국 OSM PBF 파생 데이터, Python, SHA-256 | 서울 보행망 구성과 사전 생성 타일 검증 |
| 경로·결빙 분석 | Dijkstra, 규칙 기반 결빙 추정 | 브라우저에서 일반·추천 도보 경로와 추가 예상시간 계산 |
| API·배포 | Cloudflare Workers, Wrangler, Node.js 22, Azure App Service | 외부 API 중계, 서버 비밀값 관리, 웹 앱 배포 |
| 이동 안내·알림 | Geolocation, Web Speech, Vibration, Service Worker, Web Push, Azure Logic Apps | 위치·음성·진동 안내와 결빙 알림 시연 |
| 테스트·정적 검사 | Vitest, Testing Library, Playwright, ESLint | 단위·컴포넌트·종단 테스트와 코드 검사 |

일반 경로와 추천 경로는 브라우저의 `src/core`에서 같은 서울 보행 그래프로 계산합니다.
결빙 위험은 실제 기상과 건물 그늘·보행교 정보를 조합해 추정하며, 추천 경로는
결빙 위험 예상·계단·경사 간선을 제외한 그래프에서 계산합니다.
[데이터 출처와 분석 방식](docs/DATA_AND_AI.md)

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

## 로컬 실행

Node.js 22.12 이상, Python 3, curl을 사용합니다. 팀에서 받은 `staticdata/.env.local`은
작업 환경에 보관합니다. 장소 검색에 필요한 변수는 `TMAP_APP_KEY`입니다.
`npm run dev`는 `.dev.vars` 또는 `staticdata/.env.local`에서 이 변수를 읽습니다.

```text
npm ci
npm run data:build
npm run dev
```

`npm run dev`가 표시하는 로컬 주소에서 앱을 열고 **메뉴 → 경로 바로 열기**에서 양재 시연을 선택하세요.
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

잠금화면 결빙 알림 시연을 Azure에 구성할 때는 기존 App Service와 같은 지역에
Azure Logic Apps(Consumption)를 연결합니다. 아래 명령은 웹 푸시 발송 키와
예약 호출 인증 정보를 Azure 설정에 보관합니다. Microsoft.Logic 리소스
공급자가 등록된 구독에서 실행합니다. 준비된 배포 디렉터리에 서버 의존성도
설치한 뒤 Azure에 배포합니다.

```text
npm ci --prefix azure
node scripts/setup-azure-push.mjs <리소스-그룹> <웹-앱>
npm run build:azure
npm ci --omit=dev --prefix dist/azure-app
node --test azure/push.test.mjs
```

예약은 참여 기기가 알림을 켤 때만 실행되며 10분 간격으로 1시간 동안 발송합니다.
발송용 구독 정보는 기존 단일 App Service의 쓰기 가능한 `/home/data`에 저장하며,
시연을 끄거나 마지막 알림을 발송하면 삭제합니다. 지연된 시연의 만료 상태는 다음
요청에서 정리합니다. iOS에서는 홈 화면에 추가한 앱에서 기기 알림을 허용합니다.

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

