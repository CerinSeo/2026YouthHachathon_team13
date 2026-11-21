import type { CueKind } from '../core/guidance';

const patterns: Record<CueKind, number | number[]> = {
  left: [120, 90, 120],
  right: [120, 90, 120],
  risk: [240, 110, 240],
  arrival: 180,
};

export const canSpeak = () => typeof window.speechSynthesis?.speak === 'function'
  && typeof window.SpeechSynthesisUtterance === 'function';
export const canVibrate = () => typeof navigator.vibrate === 'function';

export function speakKorean(message: string, onError: () => void) {
  if (!canSpeak()) return;
  try {
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.95;
    const korean = synthesis.getVoices().filter((voice) => /^ko(?:[-_]|$)/i.test(voice.lang));
    utterance.voice = korean.find((voice) => voice.localService) ?? korean[0] ?? null;
    utterance.onerror = ({ error }) => {
      if (error !== 'canceled' && error !== 'interrupted') onError();
    };
    synthesis.speak(utterance);
  } catch {
    onError();
  }
}

export function cancelSpeech() {
  window.speechSynthesis?.cancel();
}

export function vibrate(kind: CueKind) {
  if (canVibrate()) navigator.vibrate(patterns[kind]);
}

export function cancelVibration() {
  if (canVibrate()) navigator.vibrate(0);
}
