import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react';
import { type Coordinate, type Place, type RouteComparison, RouteError, type RouteRequest } from '../core/contracts';
import { compareRoutes, routeMetadata } from '../core/routing';
import { inCity } from '../core/geo';
import { PlaceSearch } from './PlaceSearch';
import { PushDemo } from './PushDemo';
import { RouteGuidance } from './RouteGuidance';
import { currentHour, dateTimeFromKst, distanceLabel, duration, formatKst, hourMs, localInput, weatherMode } from './time';
import { searchPlaces } from '../services/api';

const MapView = lazy(() => import('../map/RouteMap').then((module) => ({ default: module.RouteMap })));
const demoTime = '2026-02-02T13:00';
const demoCases = {
  yangjae: { origin: '양재역 4번출구', destination: '양재동우체국' },
  hyehwa: { origin: '혜화역 3번출구', destination: '서울대학교병원 동문' },
  cityHall: { origin: '시청역 5번출구', destination: '서울광장' },
};
type Stage = 'home' | 'search' | 'pick' | 'confirm' | 'results';
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

function RouteResults({ result, onRetry, selected, onSelect }: {
  result: RouteComparison; onRetry: () => void; selected: 'safe' | 'normal'; onSelect: (route: 'safe' | 'normal') => void;
}) {
  const { baseline, recommendation } = result;
  const [more, setMore] = useState(false);
  const details = selected === 'safe' ? recommendation.route : baseline;
  const riskCount = new Set(result.riskSegments.map((segment) => segment.edgeId)).size;
  return <section className="result-sheet" aria-label="경로 요약">
    {result.mode === 'historical_replay' && <span className="chip">과거 기상 재생</span>}
    <p className="meta">{result.dataAsOf ? <>기상 기준 {formatKst(result.dataAsOf)} · <a href="https://open-meteo.com/">Open-Meteo</a></>
      : `선택 시각 ${formatKst(result.selectedAt)}`}</p>
    {recommendation.status === 'not_evaluated' && <div className="notice warning" role="status">
      <strong>{result.reason === 'weather_failed' ? '기상 정보를 불러오지 못했어요' : '위험 정보를 계산할 자료가 부족해요'}</strong>
      <p>지금은 일반 경로만 볼 수 있어요.</p>
      <button className="button outlined" onClick={onRetry}>다시 시도</button>
    </div>}
    {recommendation.status === 'unavailable' && <div className="notice warning" role="status">
      <strong>안전 경로를 찾지 못했어요</strong>
      <p>회피 대상 구간을 빼면 이어지는 도보 경로가 없어요. 출발지나 목적지를 바꿔 보세요.</p>
    </div>}
    <fieldset className="route-choices">
      <legend>지도에서 볼 경로</legend>
      {recommendation.route && <label className="route-option route-option--safe">
        <input type="radio" name="route" checked={selected === 'safe'} onChange={() => onSelect('safe')} />
        <span><span className="legend-line solid" aria-hidden="true" />안전 경로</span>
        <strong>{duration(recommendation.route.durationSeconds)}</strong>
        <small>{distanceLabel(recommendation.route.distanceM)}{recommendation.additionalSeconds > 0
          ? ` · ${duration(recommendation.additionalSeconds)} 추가` : ' · 추가 시간 없음'}</small>
      </label>}
      <label className="route-option">
        <input type="radio" name="route" checked={selected === 'normal'} onChange={() => onSelect('normal')} />
        <span><span className="legend-line dashed" aria-hidden="true" />일반 경로</span>
        <strong>{duration(baseline.durationSeconds)}</strong>
        <small>{distanceLabel(baseline.distanceM)}</small>
      </label>
    </fieldset>
    {recommendation.status === 'same_as_baseline' && <p>두 경로가 같아요.</p>}
    {result.dataAsOf && <p className="risk-summary"><span aria-hidden="true">❄</span>
      {riskCount ? `일반 경로의 결빙 위험 예상구간 ${riskCount}곳` : '일반 경로에서 확인된 결빙 위험 예상구간이 없어요.'}</p>}
    {recommendation.route && <p className="meta">결빙 위험 예상구간을 고려한 경로예요. 실제 노면 상태에 따라 통행 위험이 달라질 수 있어요.</p>}
    {details && <button className="button outlined" aria-expanded={more} aria-controls="route-details"
      onClick={() => setMore(!more)}>{more ? '경로 상세 접기' : '경로 자세히 보기'}</button>}
    {more && details && <div id="route-details" className="route-details">
      <h3>{selected === 'safe' ? '안전 경로 상세' : '일반 경로 상세'}</h3>
      <p>거리 {distanceLabel(details.distanceM)} · 예상 소요시간 {duration(details.durationSeconds)}</p>
      <p>위험 예상은 기상·환경 자료의 추정 결과예요. 지도 자료에 계단이나 경사가 기록되지 않은 구간이 있을 수 있어요.</p>
      <p className="meta">보행망 기준 {formatKst(result.networkAsOf)} · OpenStreetMap</p>
    </div>}
    {details && <RouteGuidance key={selected} route={details} risks={result.riskSegments}
      live={result.mode === 'current' && Date.parse(result.selectedAt) === currentHour()} />}
  </section>;
}

export function App() {
  const [stage, setStage] = useState<Stage>('home');
  const [field, setField] = useState<Field>('destination');
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [draftPoint, setDraftPoint] = useState<Coordinate | null>(null);
  const [now, setNow] = useState(currentHour);
  const [inputTime, setInputTime] = useState(() => localInput(currentHour()));
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'route' | 'demo' | 'locate' | null>(null);
  const [result, setResult] = useState<RouteComparison | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<'safe' | 'normal'>('safe');
  const active = useRef<AbortController>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const focusStage = useRef(false);
  const version = useRef(0);
  useEffect(() => {
    if (focusStage.current) title.current?.focus();
    focusStage.current = true;
  }, [stage]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentHour()), 30_000);
    return () => { window.clearInterval(timer); active.current?.abort(); };
  }, []);
  const openNotificationRoute = useEffectEvent(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('notice') !== 'icing-demo') return;
    url.searchParams.delete('notice');
    window.history.replaceState(window.history.state, '', url);
    void applyDemo('yangjae', true);
  });
  useEffect(() => {
    const timer = window.setTimeout(openNotificationRoute, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function go(next: Stage) {
    active.current?.abort();
    version.current++;
    setBusy(null);
    setError('');
    setStage(next);
  }
  function edit(next: Field) {
    setField(next);
    setDraftPoint(null);
    go('search');
  }
  async function choose(place: Place) {
    const started = version.current;
    try {
      const { boundary } = await routeMetadata();
      if (started !== version.current) return;
      if (!inCity(place.coordinates, boundary)) {
        setError('서울 안의 장소를 선택해 주세요.');
        return;
      }
      if (field === 'origin') setOrigin(place);
      else setDestination(place);
      go('confirm');
    } catch {
      if (started === version.current) setError(routeErrors.MAP_DATA_UNAVAILABLE);
    }
  }
  function locate() {
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
      void choose(selectedPlace([coords.longitude, coords.latitude], 'device'));
    }, () => {
      if (started !== version.current) return;
      setBusy(null);
      setError('현재 위치를 확인하지 못했어요. 출발지를 검색하거나 지도에서 선택해 주세요.');
    }, { timeout: 8000, maximumAge: 0 });
  }
  async function applyDemo(id: keyof typeof demoCases, openResults = false) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy('demo');
    setError('');
    try {
      const { origin, destination } = demoCases[id];
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
      setInputTime(demoTime);
      setDemo(true);
      go('confirm');
    } catch {
      if (!controller.signal.aborted) {
        setBusy(null);
        setError('시연 장소를 불러오지 못했어요. 장소를 직접 선택하고 과거 시각을 지정할 수 있어요.');
      }
    }
  }
  async function calculate() {
    if (!origin || !destination) {
      edit(origin ? 'destination' : 'origin');
      return;
    }
    const timestamp = dateTimeFromKst(inputTime);
    if (!Number.isFinite(timestamp) || timestamp % hourMs !== 0 || timestamp > currentHour() + 24 * hourMs
      || timestamp < Date.UTC(2022, 0, 1)) {
      setError('2022년 이후부터 현재 기준 24시간 뒤까지의 정각을 선택해 주세요.');
      return;
    }
    await showComparison({ origin, destination, mode: weatherMode(timestamp),
      selectedAt: new Date(timestamp).toISOString(), model: demo && inputTime === demoTime ? 'ecmwf_aifs025_single' : undefined });
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
        setInputTime(demoTime);
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

  return <>
    <a className="skip-link" href="#content">본문으로 건너뛰기</a>
    <header className="topbar">
      <div className="topbar-inner">
        {stage !== 'home' && <button className="button icon back" aria-label="이전 화면"
          onClick={() => go(stage === 'pick' ? 'search' : stage === 'results' ? 'confirm' : stage === 'search' && (origin || destination) ? 'confirm' : 'home')}>‹</button>}
        <button className="wordmark" onClick={() => go('home')} aria-label="빙빙제로 홈"><span aria-hidden="true">❄</span> 빙빙제로</button>
      </div>
    </header>
    <main id="content" className={stage === 'home' ? 'main home' : 'main'}>
      {stage === 'home' && <>
        <section className="hero">
          <div className="winter" aria-hidden="true"><span>❄</span><span>❄</span><span>❄</span></div>
          <div className="hero-copy">
            <span className="chip">서울 전역 · 도보</span>
            <h1 ref={title} tabIndex={-1}>빙판길은 피하고,<br />안전 경로를 한눈에 확인하세요.</h1>
            <p>기상·환경 자료를 바탕으로 결빙 위험 예상구간을 알려드려요.</p>
            <button className="button filled hero-cta" onClick={() => { setDemo(false); setInputTime(localInput(currentHour())); edit('destination'); }}>
              <span aria-hidden="true">⌕</span> 목적지 검색하기
            </button>
          </div>
        </section>
        <section className="demo-card">
          <span className="demo-icon" aria-hidden="true">❄</span>
          <div><h2>과거 기상으로 경로 비교</h2><p>2026년 2월 2일 오후 1시의 양재역 주변 예보를 확인해 보세요.</p></div>
          <button className="button outlined" onClick={() => void applyDemo('yangjae')} disabled={busy === 'demo'}>양재 시연 열기</button>
        </section>
        <PushDemo />
        <details className="other-demos">
          <summary>다른 과거 시연 경로</summary>
          <div className="button-row">
            <button className="button outlined" onClick={() => void applyDemo('hyehwa')} disabled={busy === 'demo'}>혜화역에서 병원까지</button>
            <button className="button outlined" onClick={() => void applyDemo('cityHall')} disabled={busy === 'demo'}>시청역에서 서울광장까지</button>
          </div>
        </details>
      </>}
      {stage === 'search' && <section className="search-panel panel">
        <h1 ref={title} tabIndex={-1}>{field === 'origin' ? '출발지 선택' : '목적지 선택'}</h1>
        {(origin || destination) && <p className="meta">{origin ? `출발지 · ${origin.name}` : `목적지 · ${destination?.name}`}</p>}
        <PlaceSearch key={field} field={field} onSelect={(place) => void choose(place)}
          onLocate={field === 'origin' ? locate : undefined} onPick={() => { setDraftPoint(null); go('pick'); }} />
      </section>}
      {stage === 'pick' && <section>
        <h1 ref={title} tabIndex={-1}>지도에서 {field === 'origin' ? '출발지' : '목적지'} 선택</h1>
        <p>서울 안의 지점을 눌러 선택하세요. 장소 이름으로도 검색할 수 있어요.</p>
        <Suspense fallback={<p role="status">지도를 불러오고 있어요…</p>}>
          <MapView origin={field === 'origin' && draftPoint ? selectedPlace(draftPoint, 'map') : origin}
            destination={field === 'destination' && draftPoint ? selectedPlace(draftPoint, 'map') : destination}
            onPick={setDraftPoint} />
        </Suspense>
        <div className="button-row">
          <button className="button filled" disabled={!draftPoint} onClick={() => draftPoint && void choose(selectedPlace(draftPoint, 'map'))}>이 위치 사용</button>
          <button className="button outlined" onClick={() => go('search')}>장소 검색으로 돌아가기</button>
        </div>
      </section>}
      {stage === 'confirm' && <section>
        <h1 ref={title} tabIndex={-1}>경로 확인</h1>
        <div className="workspace">
          <Suspense fallback={<p role="status">지도를 불러오고 있어요…</p>}>
            <MapView origin={origin} destination={destination} />
          </Suspense>
          <div className="panel confirm-panel">
            {([['origin', '출발지', origin], ['destination', '목적지', destination]] as const).map(([id, caption, place]) =>
              <div key={id} className="confirm-row">
                <div><span className="meta">{caption}</span><strong>{place?.name ?? '선택해 주세요'}</strong>
                  {place?.address && <small>{place.address}</small>}</div>
                <button className="button outlined" onClick={() => { setDemo(false); edit(id); }}>{caption} {place ? '변경' : '선택'}</button>
              </div>)}
            <label className="time-field">기상 적용 시각 (한국 시간)
              <input type="datetime-local" value={inputTime} step="3600" min="2022-01-02T00:00"
                max={localInput(now + 24 * hourMs)} onChange={(event) => { setDemo(false); setInputTime(event.target.value); }} />
            </label>
            <p className="meta">현재부터 24시간 뒤까지의 예보 또는 과거 기상을 정각으로 선택할 수 있어요.</p>
            <div className="button-row">
              <button className="button filled" disabled={busy === 'route'} onClick={() => void calculate()}>
                {origin && destination ? '이 경로 비교하기' : origin ? '목적지 선택하기' : '출발지 선택하기'}
              </button>
              {busy === 'route' && <button className="button outlined" onClick={cancel}>계산 취소</button>}
            </div>
          </div>
        </div>
      </section>}
      {stage === 'results' && result && <section>
        <header className="result-heading">
          <div><h1 ref={title} tabIndex={-1}>경로 결과</h1><p>{origin?.name} → {destination?.name}</p></div>
          <button className="button outlined" onClick={() => go('confirm')}>입력 수정</button>
        </header>
        <div className="workspace">
          <Suspense fallback={<p role="status">지도를 불러오고 있어요…</p>}>
            <MapView origin={origin} destination={destination} result={result} selected={selectedRoute} />
          </Suspense>
          <RouteResults key={result.selectedAt + result.recommendation.status}
            result={result} selected={selectedRoute} onSelect={setSelectedRoute} onRetry={() => void calculate()} />
        </div>
      </section>}
      {busy && <p role="status" className="notice progress">
        {busy === 'route' ? '실제 기상과 보행로를 확인하고 있어요…' : busy === 'demo' ? '시연 장소를 찾고 있어요…' : '현재 위치를 확인하고 있어요…'}
      </p>}
      {error && <p role="alert" className="notice error">{error}</p>}
    </main>
  </>;
}
