import type { Mode } from '../core/contracts';

export const hourMs = 3_600_000;
const offsetMs = 9 * hourMs;
const format = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
export const localInput = (timestamp: number) => new Date(timestamp + offsetMs).toISOString().slice(0, 16);
export const currentHour = () => Math.floor(Date.now() / hourMs) * hourMs;
export const formatKst = (timestamp: string | number) => format.format(new Date(timestamp));
export const dateTimeFromKst = (input: string) => Date.parse(`${input}+09:00`);
export const weatherMode = (timestamp: number): Mode => timestamp < currentHour() ? 'historical_replay'
  : timestamp === currentHour() ? 'current' : 'forecast';

export function duration(seconds: number) {
  return seconds === 0 ? '0분' : seconds < 60 ? '1분 미만' : `약 ${Math.round(seconds / 60)}분`;
}

export function distanceLabel(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}
