import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Coordinate, RiskSegment, WalkingRoute } from '../core/contracts';
import { distance } from '../core/geo';
import { type Cue, cueText, isUpcoming, matchPosition, planGuidance, shouldAnnounce } from '../core/guidance';
import { cancelSpeech, cancelVibration, canSpeak, canVibrate, speakKorean, vibrate } from '../services/guidanceFeedback';
import { distanceLabel, duration } from './time';

interface Props {
  route: WalkingRoute;
  risks: RiskSegment[];
  live: boolean;
  instructionPortal?: HTMLElement | null;
  destination?: string;
  onModeChange?: (mode: GuidanceMode) => void;
  onPositionChange?: (point: Coordinate | null) => void;
}
export type GuidanceMode = 'idle' | 'preview' | 'tracking' | 'arrived';

const waiting = '현재 위치를 확인하고 있어요.';
const locationLost = '경로 위의 현재 위치를 확인하지 못했어요. 지도나 경로 단계를 확인해 주세요.';

export function RouteGuidance({ route, risks, live, instructionPortal, destination, onModeChange, onPositionChange }: Props) {
  const plan = useMemo(() => planGuidance(route, risks), [route, risks]);
  const [mode, setMode] = useState<GuidanceMode>('idle');
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState<number | null>(null);
  const [positionMessage, setPositionMessage] = useState('');
  const [speechError, setSpeechError] = useState(false);
  const speechSupported = canSpeak();
  const hapticsSupported = canVibrate();
  const [voice, setVoice] = useState(speechSupported);
  const [haptics, setHaptics] = useState(hapticsSupported);
  const preference = useRef({ voice, haptics });
  const watch = useRef<number | null>(null);
  const session = useRef(0);
  const progress = useRef<number | null>(null);
  const uncertain = useRef(false);
  const spoken = useRef(new Set<Cue>());
  const focus = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const stepsOpener = useRef<HTMLButtonElement>(null);
  const openedFromSteps = useRef(false);

  const stopTracking = useCallback(() => {
    session.current++;
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    }
  }, []);
  const stopFeedback = useCallback(() => {
    cancelSpeech();
    cancelVibration();
  }, []);

  useEffect(() => {
    function pauseWhenHidden() {
      if (!document.hidden) return;
      stopFeedback();
      if (watch.current !== null) {
        stopTracking();
        setOffset(null);
        setMode('preview');
        setPositionMessage('화면을 나가 위치 안내를 멈췄어요. 다시 시작하거나 단계별로 확인해 주세요.');
      }
    }
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      stopTracking();
      stopFeedback();
    };
  }, [stopTracking, stopFeedback]);

  useEffect(() => {
    onModeChange?.(mode);
    if (mode !== 'idle') focus.current?.focus();
  }, [mode, onModeChange]);

  function read(message: string) {
    if (!preference.current.voice) return;
    setSpeechError(false);
    speakKorean(message, () => setSpeechError(true));
  }
  function sendCues(cues: Cue[], from: number, approaching = false) {
    read(cues.map((cue) => cueText(cue, from, approaching)).join('. '));
    if (preference.current.haptics) {
      const first = cues.find((cue) => cue.kind === 'risk') ?? cues[0];
      vibrate(first.kind);
    }
  }
  function showStep(next: number) {
    setIndex(next);
    const from = next ? plan.cues[next - 1].offset : 0;
    sendCues([plan.cues[next]], from);
  }
  function preview() {
    setPositionMessage('');
    setMode('preview');
    showStep(0);
  }
  function start() {
    if (!live) return;
    if (!navigator.geolocation) {
      preview();
      setPositionMessage('이 브라우저에서 위치 안내를 사용할 수 없어요. 단계별로 확인해 주세요.');
      return;
    }
    stopTracking();
    const active = session.current;
    progress.current = null;
    uncertain.current = false;
    spoken.current.clear();
    setIndex(0);
    setOffset(null);
    onPositionChange?.(null);
    setPositionMessage(waiting);
    setMode('tracking');
    read(waiting);
    const locationUnavailable = () => {
      if (session.current !== active) return;
      stopTracking();
      stopFeedback();
      setOffset(null);
      setMode('preview');
      setPositionMessage('위치를 확인할 수 없어 위치 안내를 멈췄어요. 단계별로 확인해 주세요.');
    };
    try {
      watch.current = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
        if (session.current !== active || document.hidden) return;
        const point: Coordinate = [coords.longitude, coords.latitude];
        const next = Date.now() - timestamp > 12_000 ? null
          : matchPosition(plan, point, coords.accuracy, progress.current);
        setOffset(next);
        onPositionChange?.(next === null ? null : point);
        if (next === null) {
          setPositionMessage(locationLost);
          if (!uncertain.current) {
            stopFeedback();
            read(locationLost);
          }
          uncertain.current = true;
          return;
        }
        progress.current = next;
        uncertain.current = false;
        setPositionMessage('');
        const end = route.coordinates.at(-1)!;
        const maneuver = plan.cues.find((cue) => cue.kind !== 'risk' && isUpcoming(cue, next));
        const risk = plan.cues.find((cue) => cue.kind === 'risk' && shouldAnnounce(cue, next));
        const due = [maneuver, risk].filter((cue): cue is Cue => !!cue
          && !spoken.current.has(cue) && shouldAnnounce(cue, next)
          && (cue.kind !== 'arrival' || (coords.accuracy <= 15 && distance(point, end) <= 18)));
        if (!due.length) return;
        due.forEach((cue) => spoken.current.add(cue));
        sendCues(due.sort((a, b) => a.offset - b.offset), next, true);
        if (due.some((cue) => cue.kind === 'arrival')) {
          stopTracking();
          setMode('arrived');
        }
      }, locationUnavailable, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
    } catch {
      locationUnavailable();
    }
  }
  function finish() {
    stopTracking();
    stopFeedback();
    setMode('idle');
    setOffset(null);
    onPositionChange?.(null);
    setPositionMessage('');
    requestAnimationFrame(() => (openedFromSteps.current ? stepsOpener.current : opener.current)?.focus());
  }

  if (mode === 'idle') return <div className="button-row guidance-launch">
    {live && <button className="button filled" ref={opener}
      onClick={() => { openedFromSteps.current = false; start(); }}>안내 시작</button>}
    <button className={`button ${live ? 'outlined' : 'filled'}`} ref={stepsOpener}
      onClick={() => { openedFromSteps.current = true; preview(); }}>경로 단계 보기</button>
  </div>;

  const trackedCue = offset === null ? undefined : plan.cues.find((cue) => isUpcoming(cue, offset));
  const cue = mode === 'preview' ? plan.cues[index] : trackedCue;
  const from = mode === 'preview' ? (index ? plan.cues[index - 1].offset : 0) : offset ?? 0;
  const message = mode === 'arrived' ? '목적지 근처입니다' : cue ? cueText(cue, from) : positionMessage;
  const remaining = offset === null ? null : Math.max(0, route.distanceM - offset);
  const instruction = <header className="guidance-banner">
    <div>
      <h3 id="guidance-heading" ref={focus} tabIndex={-1}>{mode === 'preview' ? '경로 단계' : '도보 안내'}</h3>
      <p role="status" className="guidance-instruction">
        {(cue?.kind === 'left' || cue?.kind === 'right') &&
          <span aria-hidden="true">{cue.kind === 'left' ? '↰' : '↱'}</span>}
        {message}
      </p>
    </div>
    <button className="button outlined" disabled={!voice || !message} onClick={() => read(message)}>다시 듣기</button>
  </header>;
  const options = <>
    <div className="guidance-options">
      <label>
        <input type="checkbox" checked={voice} disabled={!speechSupported} onChange={(event) => {
          const enabled = event.target.checked;
          preference.current.voice = enabled;
          setVoice(enabled);
          if (!enabled) cancelSpeech();
        }} /> 음성 안내
      </label>
      <label>
        <input type="checkbox" checked={haptics} disabled={!hapticsSupported} onChange={(event) => {
          const enabled = event.target.checked;
          preference.current.haptics = enabled;
          setHaptics(enabled);
          if (!enabled) cancelVibration();
        }} /> 진동 안내
      </label>
    </div>
    {!speechSupported && <p className="meta">이 브라우저는 음성 재생을 지원하지 않아요.</p>}
    {!hapticsSupported && <p className="meta">이 브라우저는 진동 안내를 지원하지 않아요.</p>}
  </>;
  return <>
    {instructionPortal ? createPortal(instruction, instructionPortal) : instruction}
    <section className="route-guidance" aria-labelledby="guidance-heading">
      {mode === 'preview' && <p className="meta">경로 단계 {index + 1} / {plan.cues.length}</p>}
      {mode === 'preview' && positionMessage && <p className="meta">{positionMessage}</p>}
      {mode === 'tracking' && <>
        {destination && <h2>{destination}까지</h2>}
        {remaining !== null && <p className="remaining"><strong>{duration(remaining)}</strong> · {distanceLabel(remaining)} 남음</p>}
      </>}
      {mode === 'arrived' && <h2>{destination ?? '목적지'} 근처에 도착했어요</h2>}
      {speechError && <p className="meta" role="status">음성을 재생하지 못했어요. 기기의 한국어 음성 설정을 확인해 주세요.</p>}
      {mode === 'preview' && <div className="button-row">
        <button className="button outlined" disabled={index === 0} onClick={() => showStep(index - 1)}>이전 단계</button>
        <button className="button outlined" disabled={index === plan.cues.length - 1} onClick={() => showStep(index + 1)}>다음 단계</button>
        {live && <button className="button outlined" onClick={start}>위치 안내 시작</button>}
      </div>}
      <div className="button-row">
        <button className="button outlined guidance-end" onClick={finish}>안내 종료</button>
      </div>
      {instructionPortal ? <details className="guidance-preferences"><summary>음성·진동 설정</summary>{options}</details> : options}
    </section>
  </>;
}
