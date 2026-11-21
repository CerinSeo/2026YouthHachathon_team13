const hourMs = 3_600_000;
export const currentHour = () => Math.floor(Date.now() / hourMs) * hourMs;
export const dateTimeFromKst = (input: string) => Date.parse(`${input}+09:00`);

export function duration(seconds: number) {
  return seconds === 0 ? '0분' : seconds < 60 ? '1분 미만' : `약 ${Math.round(seconds / 60)}분`;
}

export function distanceLabel(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}
