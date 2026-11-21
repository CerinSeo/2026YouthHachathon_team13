import { useEffect, useState } from 'react';

const sessionKey = 'bingbingzero:push-demo';
type Session = { id: string; endsAt: number };
type Setup = { registration: ServiceWorkerRegistration; publicKey: string; subscription: PushSubscription | null };

class PushError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(code);
  }
}

async function post<T>(action: string, body: object): Promise<T> {
  const response = await fetch(`/api/push/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new PushError(response.status, data.error);
  return data;
}

export function PushDemo() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    async function prepare() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (mounted) setMessage('이 화면에서는 기기 알림을 켤 수 없어요. 아이폰은 홈 화면에 추가한 빙빙제로 앱을 열어 주세요.');
        return;
      }
      const response = await fetch('/api/push/config');
      const { publicKey } = await response.json();
      if (!response.ok || !publicKey) throw new Error('Push unavailable');
      await navigator.serviceWorker.register('/push-sw.js');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const id = localStorage.getItem(sessionKey);
      if (id && subscription) {
        try {
          const existing = await post<Session>('status', { id });
          if (mounted && existing.endsAt > Date.now()) setSession(existing);
        } catch (error) {
          if (!(error instanceof PushError && error.status === 404)) throw error;
        }
      }
      if (mounted) setSetup({ registration, publicKey, subscription });
    }
    void prepare().catch(() => {
      if (mounted) setMessage('알림 시연을 준비하지 못했어요. 잠시 뒤 화면을 다시 열어 주세요.');
    }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      setSession(null);
      localStorage.removeItem(sessionKey);
      setMessage('1시간 알림 시연이 끝났어요.');
    }, Math.max(0, session.endsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);

  async function enable() {
    if (!setup) return;
    setBusy(true);
    setMessage('');
    try {
      const subscription = setup.subscription ?? await setup.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: setup.publicKey,
      });
      setSetup({ ...setup, subscription });
      const next = await post<Session>('enable', { subscription: subscription.toJSON() });
      localStorage.setItem(sessionKey, next.id);
      setSession(next);
      setMessage('기기 알림을 켰어요. 화면을 잠가도 발송돼요.');
    } catch (error) {
      if (Notification.permission === 'denied') {
        setMessage('알림이 차단돼 있어요. 기기나 브라우저 설정에서 빙빙제로 알림을 허용해 주세요.');
      } else if (error instanceof PushError && error.status === 429) {
        setMessage('시연에 참여 중인 기기가 많아요. 나중에 다시 시도해 주세요.');
      } else {
        setMessage('알림을 켜지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function manage(action: 'disable' | 'test') {
    if (!session) return;
    setBusy(true);
    setMessage('');
    try {
      await post(action, { id: session.id });
      if (action === 'disable') {
        setSession(null);
        localStorage.removeItem(sessionKey);
        if (setup?.subscription && await setup.subscription.unsubscribe().catch(() => false)) {
          setSetup({ ...setup, subscription: null });
        }
        setMessage('반복 알림을 껐어요.');
      } else {
        setMessage('양재 예시 알림을 보냈어요. 기기 알림을 누르면 양재 시연 경로가 열려요.');
      }
    } catch (error) {
      if (error instanceof PushError && error.status === 404) {
        setSession(null);
        setMessage('알림 시연이 종료됐어요. 다시 켜고 시험해 주세요.');
      } else if (error instanceof PushError && error.code === 'wait_to_test') {
        setMessage('시험 알림을 다시 보내려면 30초 기다려 주세요.');
      } else {
        setMessage('요청을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel notification-settings" aria-labelledby="notification-settings-title">
    <h2 id="notification-settings-title">잠금화면 결빙 알림 시연</h2>
    <p>양재역에서 양재동우체국까지 자주 걷는 상황을 가정해요. 알림을 켜면 10분마다 1시간 동안 기기에 발송해요.</p>
    <p className="meta">아이폰은 Safari에서 공유 → 홈 화면에 추가를 선택한 뒤, 추가한 앱에서 알림을 켜 주세요.</p>
    {setup && <div className="button-row">
      {session ? <>
        <button className="button filled" disabled={busy} onClick={() => void manage('test')}>양재 예시 알림 보내기</button>
        <button className="button outlined" disabled={busy} onClick={() => void manage('disable')}>반복 알림 끄기</button>
      </> : <button className="button filled" disabled={busy} onClick={() => void enable()}>기기 알림 켜기</button>}
    </div>}
    <p role="status" className="meta">{message || (busy && !setup ? '알림을 준비하고 있어요…' : '')}</p>
  </section>;
}
