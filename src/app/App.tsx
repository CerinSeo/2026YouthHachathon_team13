import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react';
import { type Coordinate, type Place, type RouteComparison, RouteError, type RouteRequest } from '../core/contracts';
import { compareRoutes, routeMetadata } from '../core/routing';
import { inCity } from '../core/geo';
import { PlaceSearch } from './PlaceSearch';
import { PushDemo } from './PushDemo';
import { RouteGuidance, type GuidanceMode } from './RouteGuidance';
import { currentHour, dateTimeFromKst, distanceLabel, duration } from './time';
import { searchPlaces } from '../services/api';

const MapView = lazy(() => import('../map/RouteMap').then((module) => ({ default: module.RouteMap })));
const firstVisitKey = 'bingbingzero:demo-intro-seen';
const demoTime = '2026-02-02T13:00';
type DemoCase = { label: string; origin: string; destination: string };
const yangjaeDemo: DemoCase = { label: '양재역에서 우체국까지', origin: '양재역 4번출구', destination: '양재동우체국' };
const demoCases: DemoCase[] = [
  yangjaeDemo,
  { label: '양재역에서 KT 양재지사까지', origin: '양재역 6번출구', destination: 'KT 양재지사' },
];
type Stage = 'home' | 'notification' | 'confirm' | 'results';
type Field = 'origin' | 'destination';
const routeErrors: Record<string, string> = {
  OUTSIDE_SEOUL: '서울 안의 장소를 선택해 주세요.',
  NETWORK_SNAP_FAILED: '근처 보행로를 찾지 못했어요. 다른 출입구나 장소를 선택해 주세요.',
  SAME_NETWORK_NODE: '출발지와 목적지가 같은 보행로 지점에 연결됐어요. 장소를 다시 선택해 주세요.',
  BASELINE_ROUTE_NOT_FOUND: '두 장소를 잇는 도보 경로를 찾지 못했어요. 출발지나 목적지를 바꿔 주세요.',
  MAP_DATA_UNAVAILABLE: '보행로 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
};

function selectedPlace(coordinates: Coordinate, source: 'device' | 'map'): Place {
  return { id: `${source}:${coordinates.join(',')}`, name: source === 'device' ? '현재 위치' : '지도에서 선택한 위치',
    address: '', coordinates, coordinate_source: source };
}

function isYangjaeNotification(params: URLSearchParams) {
  const notice = params.get('notice');
  return notice === 'yangjae-demo' || notice === 'icing-demo';
}

function RouteResults({ result, now, onRetry, selected, onSelect, guidanceMode, onModeChange, onPositionChange, instructionPortal, destination }: {
  result: RouteComparison; onRetry: () => void; selected: 'safe' | 'normal'; onSelect: (route: 'safe' | 'normal') => void;
  now: number;
  guidanceMode: GuidanceMode; onModeChange: (mode: GuidanceMode) => void; onPositionChange: (point: Coordinate | null) => void;
  instructionPortal: HTMLElement | null; destination: string;
}) {
  const { baseline, recommendation } = result;
  const details = selected === 'safe' ? recommendation.route : baseline;
  const extraSeconds = selected === 'safe' ? recommendation.additionalSeconds : null;
  const riskCount = new Set(result.riskSegments.map((segment) => segment.edgeId)).size;
  return <section id="route-summary" tabIndex={-1} className="result-sheet" aria-label="경로 요약">
    <div className="comparison" hidden={guidanceMode !== 'idle'}>
      {recommendation.status === 'not_evaluated' && <div className="notice warning" role="status">
        <strong>{result.reason === 'weather_failed' ? '기상 정보를 불러오지 못했어요' : '위험 정보를 계산할 자료가 부족해요'}</strong>
        <p>일반 경로만 볼 수 있어요.</p>
        <button className="button outlined" onClick={onRetry}>다시 시도</button>
      </div>}
      {recommendation.status === 'unavailable' && <div className="notice warning" role="status">
        <strong>추천 경로를 찾지 못했어요</strong>
        <p>출발지나 목적지를 바꿔 보세요.</p>
      </div>}
      <fieldset className="route-choices">
        <legend className="sr-only">지도에서 볼 경로</legend>
        {recommendation.route && <label className="route-option route-option--safe">
          <input type="radio" name="route" checked={selected === 'safe'} onChange={() => onSelect('safe')} />
          <span><span className="legend-line solid" aria-hidden="true" />추천 경로</span>
          <strong>{duration(recommendation.route.durationSeconds)}</strong>
          <small>{distanceLabel(recommendation.route.distanceM)}</small>
        </label>}
        <label className="route-option">
          <input type="radio" name="route" checked={selected === 'normal'} onChange={() => onSelect('normal')} />
          <span><span className="legend-line dashed" aria-hidden="true" />일반 경로</span>
          <strong>{duration(baseline.durationSeconds)}</strong>
          <small>{distanceLabel(baseline.distanceM)}</small>
        </label>
      </fieldset>
      {result.dataAsOf && <p className="risk-summary"><span aria-hidden="true">❄</span>
        {result.mode === 'historical_replay'
          ? `과거 예보 · 결빙 위험 구간 ${riskCount}곳`
          : riskCount ? `일반 경로 · 결빙 위험 예상 ${riskCount}곳` : '예보상 결빙 위험 구간이 없어요.'}</p>}
    </div>
    {extraSeconds !== null && extraSeconds > 0 && guidanceMode !== 'arrived' &&
      <p className="route-extra-time">일반 경로보다 <strong>{duration(extraSeconds)} 더 걸려요</strong></p>}
    {details && <RouteGuidance key={selected} route={details} risks={result.riskSegments}
      live={result.mode === 'current' && Date.parse(result.selectedAt) === now}
      instructionPortal={instructionPortal} destination={destination} onModeChange={onModeChange} onPositionChange={onPositionChange} />}
    {result.dataAsOf && guidanceMode === 'idle' && <p className="surface-note">실제 길 상태를 확인하세요.</p>}
  </section>;
}

export function App() {
  const [stage, setStage] = useState<Stage>(() =>
    isYangjaeNotification(new URLSearchParams(window.location.search)) ? 'notification' : 'home');
  const [field, setField] = useState<Field>('destination');
  const [editingPlace, setEditingPlace] = useState(false);
  const [pickingOnMap, setPickingOnMap] = useState(false);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [draftPoint, setDraftPoint] = useState<Coordinate | null>(null);
  const [mapLocation, setMapLocation] = useState<Coordinate | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [firstVisit, setFirstVisit] = useState(() => {
    try {
      return window.localStorage.getItem(firstVisitKey) !== '1';
    } catch {
      return true;
    }
  });
  const showFirstVisit = stage === 'home' && firstVisit;
  const [now, setNow] = useState(currentHour);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'route' | 'demo' | 'locate' | null>(null);
  const [result, setResult] = useState<RouteComparison | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<'safe' | 'normal'>('safe');
  const [guidanceMode, setGuidanceMode] = useState<GuidanceMode>('idle');
  const [guidePosition, setGuidePosition] = useState<Coordinate | null>(null);
  const [instructionPortal, setInstructionPortal] = useState<HTMLDivElement | null>(null);
  const active = useRef<AbortController>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const homeSearchButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const menuTitle = useRef<HTMLHeadingElement>(null);
  const firstVisitTitle = useRef<HTMLHeadingElement>(null);
  const originButton = useRef<HTMLButtonElement>(null);
  const destinationButton = useRef<HTMLButtonElement>(null);
  const previousStage = useRef(stage);
  const version = useRef(0);
  const homeOrigin = useRef<Coordinate | null>(null);
  const requestedHomeLocation = useRef(false);
  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    if (stage === 'home') homeSearchButton.current?.focus();
    else title.current?.focus();
  }, [stage]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentHour()), 30_000);
    return () => { window.clearInterval(timer); active.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!showFirstVisit) return;
    firstVisitTitle.current?.focus({ preventScroll: true });
    try {
      window.localStorage.setItem(firstVisitKey, '1');
    } catch {
      // Dismissal still works for the current visit if storage is blocked.
    }
  }, [showFirstVisit]);
  useEffect(() => {
    if (stage !== 'home' || showFirstVisit || menuOpen || requestedHomeLocation.current || !navigator.geolocation) return;
    requestedHomeLocation.current = true;
    const started = version.current;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (version.current === started) setMapLocation([coords.longitude, coords.latitude]);
    }, () => {}, { timeout: 8000, maximumAge: 120_000 });
  }, [stage, showFirstVisit, menuOpen]);
  const openNotificationRoute = useEffectEvent(() => {
    const url = new URL(window.location.href);
    if (!isYangjaeNotification(url.searchParams)) return;
    url.searchParams.delete('notice');
    window.history.replaceState(window.history.state, '', url);
    void applyDemo(yangjaeDemo, true);
  });
  useEffect(() => {
    const timer = window.setTimeout(openNotificationRoute, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function go(next: Stage) {
    if (showFirstVisit) setFirstVisit(false);
    active.current?.abort();
    version.current++;
    setBusy(null);
    setError('');
    setGuidanceMode('idle');
    setGuidePosition(null);
    setEditingPlace(false);
    setPickingOnMap(false);
    setStage(next);
  }
  function edit(next: Field) {
    active.current?.abort();
    version.current++;
    setError('');
    setBusy(null);
    setField(next);
    setDraftPoint(null);
    setPickingOnMap(false);
    setEditingPlace(true);
    if (editingPlace && field === next) requestAnimationFrame(() => document.getElementById('place-query')?.focus());
  }
  function closeEditor() {
    version.current++;
    setError('');
    setEditingPlace(false);
    requestAnimationFrame(() => (field === 'origin' ? originButton.current : destinationButton.current)?.focus());
  }
  async function choose(place: Place, target = field) {
    const started = version.current;
    try {
      const { boundary } = await routeMetadata();
      if (started !== version.current) return;
      if (!inCity(place.coordinates, boundary)) {
        setError('서울 안의 장소를 선택해 주세요.');
        return;
      }
      if (target === 'origin') setOrigin(place);
      else setDestination(place);
      setDemo(false);
      go('confirm');
      requestAnimationFrame(() => (target === 'origin' ? originButton.current : destinationButton.current)?.focus());
    } catch {
      if (started === version.current) setError(routeErrors.MAP_DATA_UNAVAILABLE);
    }
  }
  function locate(onLocated: (point: Coordinate) => void) {
    if (!navigator.geolocation) {
      setError('현재 위치를 사용할 수 없어요. 장소를 검색해 주세요.');
      return;
    }
    const started = ++version.current;
    setBusy('locate');
    setError('');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (started !== version.current) return;
      setBusy(null);
      onLocated([coords.longitude, coords.latitude]);
    }, () => {
      if (started !== version.current) return;
      setBusy(null);
      setError('현재 위치를 확인하지 못했어요. 장소 이름이나 주소로 검색해 주세요.');
    }, { timeout: 8000, maximumAge: 0 });
  }
  async function applyDemo({ origin, destination }: DemoCase, openResults = false) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy('demo');
    setError('');
    try {
      const [starts, ends] = await Promise.all([
        searchPlaces(origin, controller.signal), searchPlaces(destination, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      const normalized = (name: string) => name.replace(/[^가-힣0-9]/g, '');
      const from = starts.find((p) => normalized(p.name) === normalized(origin));
      const to = ends.find((p) => normalized(p.name) === normalized(destination));
      if (!from || !to) throw new Error('Place unavailable');
      if (openResults) {
        await showComparison({
          origin: from, destination: to, mode: 'historical_replay',
          selectedAt: new Date(dateTimeFromKst(demoTime)).toISOString(), model: 'ecmwf_aifs025_single',
        }, true);
        return;
      }
      setOrigin(from);
      setDestination(to);
      setDemo(true);
      go('confirm');
    } catch {
      if (!controller.signal.aborted) {
        setBusy(null);
        setError('경로에 필요한 장소를 찾지 못했어요. 다시 시도해 주세요.');
      }
    }
  }
  async function calculate() {
    if (!origin || !destination) {
      edit(destination ? 'origin' : 'destination');
      return;
    }
    await showComparison({ origin, destination, mode: demo ? 'historical_replay' : 'current',
      selectedAt: new Date(demo ? dateTimeFromKst(demoTime) : currentHour()).toISOString(),
      model: demo ? 'ecmwf_aifs025_single' : undefined });
  }
  async function showComparison(request: RouteRequest, fromNotification = false) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy('route');
    setError('');
    try {
      const next = await compareRoutes(request, controller.signal);
      if (controller.signal.aborted) return;
      if (fromNotification) {
        setOrigin(request.origin);
        setDestination(request.destination);
        setDemo(true);
      }
      setResult(next);
      setSelectedRoute(next.recommendation.route ? 'safe' : 'normal');
      go('results');
    } catch (failure) {
      if (controller.signal.aborted) return;
      setBusy(null);
      setError(failure instanceof RouteError ? routeErrors[failure.code] : '경로를 계산하지 못했어요. 다시 시도해 주세요.');
    }
  }
  function cancel() {
    active.current?.abort();
    version.current++;
    setBusy(null);
  }

  function startSearch() {
    setOrigin(homeOrigin.current ? selectedPlace(homeOrigin.current, 'device') : null);
    setDestination(null);
    setDemo(false);
    go('confirm');
  }

  function useHomeLocation() {
    locate((point) => {
      const started = version.current;
      void routeMetadata().then(({ boundary }) => {
        if (started !== version.current) return;
        if (inCity(point, boundary)) {
          homeOrigin.current = point;
          setMapLocation(point);
        }
        else setError('서울 안에서 현재 위치로 출발하거나 출발지를 직접 선택해 주세요.');
      }).catch(() => { if (started === version.current) setError(routeErrors.MAP_DATA_UNAVAILABLE); });
    });
  }

  function closeFirstVisit() {
    setFirstVisit(false);
    menuButton.current?.focus();
  }

  function openMenu() {
    setFirstVisit(false);
    menuDialog.current?.showModal();
    setMenuOpen(true);
    menuTitle.current?.focus();
  }

  const mapLoading = <p role="status" className="map-loading">지도를 불러오고 있어요…</p>;
  const backButton = (to: Stage, label = '이전 화면') =>
    <button type="button" className="button icon back" aria-label={label} onClick={() => go(to)}>‹</button>;
  const message = <>
    {busy && <p role="status" className="notice progress">
      {busy === 'locate' ? '현재 위치를 확인하고 있어요…' : '경로를 찾고 있어요…'}
    </p>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </>;

  return <>
    <a className="skip-link" href="#content">본문으로 건너뛰기</a>
    {stage === 'notification' && <header className="topbar">
      <div className="topbar-inner">{backButton('home')}
        <button className="wordmark" onClick={() => go('home')} aria-label="빙빙제로 홈"><span aria-hidden="true">❄</span>빙빙제로</button>
      </div></header>}
    <dialog ref={menuDialog} id="app-menu" className="app-menu" aria-labelledby="app-menu-title"
      onClose={() => { setMenuOpen(false); menuButton.current?.focus(); }}>
      <header className="menu-heading">
        <h2 id="app-menu-title" ref={menuTitle} tabIndex={-1}>메뉴</h2>
        <button type="button" className="button outlined" onClick={() => menuDialog.current?.close()}>닫기</button>
      </header>
      {menuOpen && <>
        <details className="menu-section">
          <summary>알림 설정</summary>
          <PushDemo />
        </details>
        <details className="menu-section">
          <summary>경로 바로 열기</summary>
          <div className="menu-actions">
            {demoCases.map((scenario) => <button key={scenario.label} type="button" className="button outlined"
              onClick={() => { menuDialog.current?.close(); void applyDemo(scenario); }}>{scenario.label}</button>)}
          </div>
        </details>
      </>}
    </dialog>
    <main id="content" tabIndex={-1}
      className={stage === 'home' ? 'main home' : stage === 'confirm' || stage === 'results' ? 'main main--route' : 'main'}>
      {stage === 'home' && <section className="home-map" aria-labelledby="home-title">
        <header className="home-intro">
          <div className="home-brand"><span aria-hidden="true">❄</span> 빙빙제로</div>
          <h1 id="home-title">빙판길을 피해 걷는 길</h1>
          <button type="button" ref={menuButton}
            className={`button icon menu-button${showFirstVisit ? ' menu-button--highlight' : ''}`}
            aria-label="메뉴" aria-haspopup="dialog" aria-controls="app-menu" aria-expanded={menuOpen}
            onClick={openMenu}><span className="menu-glyph" aria-hidden="true" /></button>
          {showFirstVisit && <section className="first-visit-tip" role="dialog" aria-labelledby="first-visit-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); closeFirstVisit(); }
            }}>
            <h2 id="first-visit-title" ref={firstVisitTitle} tabIndex={-1}>빙빙제로 시연 안내</h2>
            <ol>
              <li><strong>알림 허용</strong> ‘알림 설정’에서 잠금화면 알림을 켜세요.</li>
              <li><strong>시연 경로 보기</strong> ‘경로 바로 열기’에서 직접 걷지 않고도 결빙 위험 구간과 길 안내를 확인할 수 있어요.</li>
            </ol>
            <div className="button-row">
              <button type="button" className="button filled" onClick={openMenu}>메뉴 열기</button>
              <button type="button" className="button outlined" onClick={closeFirstVisit}>닫기</button>
            </div>
          </section>}
        </header>
        <div className="home-map-layer">
          <Suspense fallback={mapLoading}>
            <MapView origin={null} destination={null} location={mapLocation} initialZoom={15}
              onLocate={useHomeLocation} locating={busy === 'locate'} />
          </Suspense>
        </div>
        <section className="home-sheet" aria-label="도보 길찾기">
          {message}
          <button type="button" ref={homeSearchButton} className="button filled main-action" onClick={startSearch}>
            목적지 입력하기
          </button>
        </section>
      </section>}
      {stage === 'notification' && <section className="panel">
        <h1 ref={title} tabIndex={-1}>양재 도보 경로</h1>
        <p>양재역 4번 출구 → 양재동우체국</p>
        {error && <button className="button filled" onClick={() => void applyDemo(yangjaeDemo, true)}>다시 시도</button>}
      </section>}
      {stage === 'confirm' && <section className="route-screen input-screen">
        <header className="trip-bar">
          {backButton('home')}
          <div><h1 ref={title} tabIndex={-1}>출발지와 목적지</h1></div>
        </header>
        <div className="route-inputs">
          {([['origin', '출발지', origin, originButton], ['destination', '목적지', destination, destinationButton]] as const)
            .map(([id, label, place, button]) => <button type="button" key={id} className="place-field" ref={button}
              aria-expanded={editingPlace && field === id} onClick={() => editingPlace && field === id ? closeEditor() : edit(id)}>
              <span className={`place-dot place-dot--${id}`} aria-hidden="true" />
              <strong>{label}</strong>
              <span>{place?.name ?? '입력하기'}{place?.address && <small>{place.address}</small>}</span>
              <span aria-hidden="true">›</span>
            </button>)}
          {origin?.coordinate_source !== 'device' && <button type="button" className="button outlined current-origin" disabled={busy === 'locate'}
            onClick={() => locate((point) => void choose(selectedPlace(point, 'device'), 'origin'))}>
            현재 위치를 출발지로
          </button>}
          {editingPlace && <div className="inline-search" onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeEditor(); }
          }}>
            <PlaceSearch key={field} field={field} onSelect={(place) => void choose(place)}
              onPick={() => { setDraftPoint(null); setEditingPlace(false); setPickingOnMap(true); }} />
          </div>}
          {pickingOnMap && <p className="pick-instruction">지도에서 {field === 'origin' ? '출발지' : '목적지'}를 눌러 주세요.</p>}
          {message}
        </div>
        <Suspense fallback={mapLoading}>
          <MapView origin={pickingOnMap && field === 'origin' && draftPoint ? selectedPlace(draftPoint, 'map') : origin}
            destination={pickingOnMap && field === 'destination' && draftPoint ? selectedPlace(draftPoint, 'map') : destination}
            onPick={pickingOnMap ? setDraftPoint : undefined} />
        </Suspense>
        <div className="route-input-footer">
          {pickingOnMap ? <div className="button-row">
            <button className="button filled main-action" disabled={!draftPoint}
              onClick={() => { if (draftPoint) void choose(selectedPlace(draftPoint, 'map')); }}>이 위치 사용</button>
            <button className="button outlined" onClick={() => edit(field)}>지도 선택 취소</button>
          </div> : <>
            <button className="button filled main-action" disabled={busy === 'route'} onClick={() => void calculate()}>경로 확인하기</button>
            {busy === 'route' && <button className="button outlined" onClick={cancel}>계산 취소</button>}
          </>}
        </div>
      </section>}
      {stage === 'results' && result && <section className={guidanceMode === 'idle' ? 'route-screen route-screen--results' : 'route-screen route-screen--guidance'}>
        <header className="trip-bar result-heading" hidden={guidanceMode !== 'idle'}>
          {backButton('confirm', '출발지와 목적지 수정')}
          <div><h1 ref={title} tabIndex={-1}>{origin?.name} → {destination?.name}</h1></div>
        </header>
        <div className="guidance-top" ref={setInstructionPortal} />
        <div className="workspace">
          <a className="skip-link skip-link--map" href="#route-summary">경로 요약으로 건너뛰기</a>
          <Suspense fallback={mapLoading}>
            <MapView origin={origin} destination={destination} result={result} selected={selectedRoute}
              location={guidanceMode === 'tracking' || guidanceMode === 'arrived' ? guidePosition : null} />
          </Suspense>
          <RouteResults key={result.selectedAt + result.recommendation.status}
            result={result} now={now} selected={selectedRoute} onSelect={setSelectedRoute} onRetry={() => void calculate()}
            instructionPortal={instructionPortal} destination={destination?.name ?? '목적지'}
            guidanceMode={guidanceMode} onModeChange={setGuidanceMode} onPositionChange={setGuidePosition} />
        </div>
      </section>}
      {stage !== 'home' && stage !== 'confirm' && message}
    </main>
  </>;
}
