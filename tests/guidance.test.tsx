// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RouteGuidance } from '../src/app/RouteGuidance';
import type { Coordinate, RiskSegment, WalkingRoute } from '../src/core/contracts';
import { matchPosition, planGuidance, shouldAnnounce } from '../src/core/guidance';

const a: Coordinate = [126.97, 37.55], b: Coordinate = [126.97, 37.55023], c: Coordinate = [126.9705, 37.55023];
const route: WalkingRoute = {
  edgeIds: ['a-b', 'b-c'], coordinates: [a, b, c], distanceM: 70, durationSeconds: 70,
  turns: [{ direction: 'right', coordinates: b, vertexIndex: 1 }],
};
const risks: RiskSegment[] = [{ edgeId: 'a-b', geometry: [[126.97, 37.5501], b] }];

class TestUtterance {
  lang = '';
  voice: unknown;
  constructor(readonly text: string) {}
}

function browserFeedback() {
  const speak = vi.fn<(utterance: TestUtterance) => void>();
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>().mockReturnValue(true);
  const koVoice = { lang: 'ko-KR', localService: true };
  vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn(), getVoices: () => [{ lang: 'en-US' }, koVoice] });
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  return { speak, vibrate, koVoice };
}

function fakePosition() {
  const clearWatch = vi.fn();
  const watchPosition = vi.fn<(success: PositionCallback, failure: PositionErrorCallback) => number>().mockReturnValue(41);
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch } });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const report = ([longitude, latitude]: Coordinate, accuracy: number) => {
    const callback = watchPosition.mock.calls.at(-1)![0];
    const values = { longitude, latitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null };
    const coords = { ...values, toJSON: () => values };
    act(() => callback({ coords, timestamp: Date.now(), toJSON: () => ({ coords }) }));
  };
  return { report, watchPosition, clearWatch };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'vibrate');
  Reflect.deleteProperty(navigator, 'geolocation');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('orders hazards that overlap the chosen graph edges, turns and arrival by distance', () => {
  const plan = planGuidance(route, [...risks, { edgeId: 'other-edge', geometry: [a, c] }]);
  expect(plan.cues.map((cue) => cue.kind)).toEqual(['risk', 'right', 'arrival']);
  expect(plan.cues[0].offset).toBeCloseTo(11, 0);
  expect(shouldAnnounce(plan.cues[0], 0)).toBe(true);
  expect(matchPosition(plan, [126.98, 37.55], 8, null)).toBeNull();
  expect(matchPosition(plan, a, 60, null)).toBeNull();
  expect(matchPosition(plan, a, 8, null)).toBe(0);
});

it('previews in Korean, replays the current text and respects separate output toggles', () => {
  const { speak, vibrate, koVoice } = browserFeedback();
  const geo = fakePosition();
  render(<RouteGuidance route={route} risks={risks} live={false} />);
  fireEvent.click(screen.getByRole('button', { name: '경로 단계 보기' }));
  expect(speak.mock.calls[0][0]).toMatchObject({ lang: 'ko-KR', voice: koVoice, text: expect.stringContaining('결빙 위험') });
  expect(vibrate).toHaveBeenCalledWith([240, 110, 240]);
  expect(geo.watchPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '다시 듣기' }));
  expect(speak).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('checkbox', { name: '음성 안내' }));
  fireEvent.click(screen.getByRole('button', { name: '다음 단계' }));
  expect(screen.getByText(/오른쪽으로 도세요/)).toBeDefined();
  expect(speak).toHaveBeenCalledTimes(2);
  expect(vibrate).toHaveBeenCalledWith([120, 90, 120]);
  fireEvent.click(screen.getByRole('checkbox', { name: '진동 안내' }));
  const before = vibrate.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '다음 단계' }));
  expect(vibrate).toHaveBeenCalledTimes(before);
});

it('suppresses turns for uncertain fixes, sends each approaching warning once and stops tracking on exit', () => {
  const { speak, vibrate } = browserFeedback();
  const geo = fakePosition();
  render(<RouteGuidance route={route} risks={risks} live />);
  fireEvent.click(screen.getByRole('button', { name: '안내 시작' }));
  geo.report(a, 80);
  expect(speak.mock.lastCall?.[0].text).toContain('현재 위치를 확인하지 못했어요');
  expect(vibrate).not.toHaveBeenCalledWith([240, 110, 240]);
  geo.report(a, 7);
  expect(speak.mock.lastCall?.[0].text).toMatch(/결빙 위험.*오른쪽으로/);
  expect(vibrate).toHaveBeenCalledWith([240, 110, 240]);
  const before = speak.mock.calls.length;
  geo.report(a, 5);
  expect(speak).toHaveBeenCalledTimes(before);
  fireEvent.click(screen.getByRole('button', { name: '안내 종료' }));
  expect(geo.clearWatch).toHaveBeenCalledWith(41);
  geo.report(c, 5);
  expect(speak).toHaveBeenCalledTimes(before);
});

it('keeps the visual steps available when location is denied and vibration is unsupported', () => {
  const geo = fakePosition();
  render(<RouteGuidance route={route} risks={[]} live />);
  fireEvent.click(screen.getByRole('button', { name: '안내 시작' }));
  act(() => geo.watchPosition.mock.calls[0][1]({ code: 1 } as GeolocationPositionError));
  expect(screen.getByRole('heading', { name: '경로 단계' })).toBeDefined();
  expect(screen.getByText(/진동 안내를 지원하지 않아요/)).toBeDefined();
  expect(screen.getByText(/오른쪽으로 도세요/)).toBeDefined();
});
