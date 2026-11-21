import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sendNotification } from 'web-push';

const repeatCount = 6;
const intervalMs = 600_000;
const testCooldownMs = 30_000;
const idPattern = /^[0-9a-f-]{36}$/;
const message = JSON.stringify({
  title: '[시연] 양재 도보 경로에 결빙이 예상돼요',
  body: '양재역 4번 출구 → 양재동우체국. 눌러서 과거 예보로 계산한 추천 경로를 확인하세요.',
});

function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !url.hash && value.endpoint.length <= 2048
      && (host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
        || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com'))
      && typeof value.keys.p256dh === 'string' && /^[\w-]{87}$/.test(value.keys.p256dh)
      && Buffer.from(value.keys.p256dh, 'base64url')[0] === 4
      && typeof value.keys.auth === 'string' && /^[\w-]{22}$/.test(value.keys.auth);
  } catch {
    return false;
  }
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error('Body too large');
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
  return value;
}

export function createPushHandler(env, { send = sendNotification, start = fetch, now = Date.now } = {}) {
  const { PUSH_PUBLIC_KEY, PUSH_PRIVATE_KEY, PUSH_WORKFLOW_URL, PUSH_JOB_KEY, WEBSITE_HOSTNAME } = env;
  const origin = env.PUSH_ORIGIN || (WEBSITE_HOSTNAME && `https://${WEBSITE_HOSTNAME}`);
  const storePath = env.PUSH_STORE_PATH || (WEBSITE_HOSTNAME && join('/home/data/bingbingzero', 'push.json'));
  const enabled = !!(PUSH_PUBLIC_KEY && PUSH_PRIVATE_KEY && PUSH_WORKFLOW_URL && PUSH_JOB_KEY && origin && storePath);
  let queue = Promise.resolve();

  async function load() {
    try {
      return JSON.parse(await readFile(storePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async function save(records) {
    await mkdir(dirname(storePath), { recursive: true, mode: 0o700 });
    const temporary = `${storePath}.tmp`;
    await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
    await rename(temporary, storePath);
  }

  async function deliver(record) {
    await send(record.subscription, message, {
      TTL: 540, urgency: 'high', timeout: 6000,
      vapidDetails: { subject: origin, publicKey: PUSH_PUBLIC_KEY, privateKey: PUSH_PRIVATE_KEY },
    });
  }

  async function transact(action, body) {
    const records = await load();
    const time = now();
    const expired = Object.keys(records).filter((id) => records[id].expiresAt <= time);
    for (const id of expired) delete records[id];
    if (expired.length) await save(records);

    if (action === 'enable') {
      if (!validSubscription(body.subscription)) return [400, { error: 'invalid_subscription' }];
      const existing = Object.entries(records).find(([, record]) =>
        record.subscription.endpoint === body.subscription.endpoint);
      if (existing) {
        const [id, record] = existing;
        if (record.subscription.keys.auth !== body.subscription.keys.auth
          || record.subscription.keys.p256dh !== body.subscription.keys.p256dh) return [409, {}];
        if (record.endsAt > time) return [200, { id, endsAt: record.endsAt }];
        delete records[id];
      }
      if (Object.keys(records).length >= 30) return [429, { error: 'demo_full' }];
      const id = randomUUID();
      const endsAt = time + repeatCount * intervalMs;
      const { endpoint, keys: { p256dh, auth } } = body.subscription;
      records[id] = { subscription: { endpoint, keys: { p256dh, auth } }, endsAt,
        expiresAt: endsAt + 5 * 60_000, sequence: 0, lastTestAt: null };
      await save(records);
      try {
        const scheduled = await start(PUSH_WORKFLOW_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          redirect: 'error', signal: AbortSignal.timeout(6000),
          body: JSON.stringify({ id, startedAt: new Date(time).toISOString() }),
        });
        if (!scheduled.ok) throw new Error('Scheduler rejected the session');
      } catch {
        delete records[id];
        await save(records);
        return [503, { error: 'scheduler_unavailable' }];
      }
      return [200, { id, endsAt }];
    }

    if (typeof body.id !== 'string' || !idPattern.test(body.id)) return [400, {}];
    const record = records[body.id];
    if (action === 'disable') {
      if (record) {
        delete records[body.id];
        await save(records);
      }
      return [200, {}];
    }
    if (!record) return action === 'tick' ? [200, {}] : [404, { error: 'session_ended' }];
    if (action === 'status') return [200, { id: body.id, endsAt: record.endsAt }];
    if (action === 'test') {
      if (record.lastTestAt !== null && time - record.lastTestAt < testCooldownMs) return [429, { error: 'wait_to_test' }];
      record.lastTestAt = time;
    } else {
      const { sequence } = body;
      if (!Number.isInteger(sequence) || sequence < 1 || sequence > repeatCount) return [400, {}];
      if (sequence <= record.sequence) return [200, {}];
      const scheduledAt = record.endsAt - (repeatCount - sequence) * intervalMs;
      if (time < scheduledAt) return [409, {}];
      record.sequence = sequence;
      if (time - scheduledAt >= intervalMs) {
        await save(records);
        return [200, {}];
      }
    }
    await save(records);
    try {
      await deliver(record);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        delete records[body.id];
        await save(records);
        return action === 'tick' ? [200, {}] : [404, { error: 'session_ended' }];
      }
      return [502, { error: 'delivery_failed' }];
    }
    if (action === 'tick' && body.sequence === repeatCount) {
      delete records[body.id];
      await save(records);
    }
    return [200, {}];
  }

  return async (request, response, url) => {
    function respond(status, data) {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    }
    const action = url.pathname.slice('/api/push/'.length);
    if (action === 'config' && request.method === 'GET') {
      return respond(200, { publicKey: enabled ? PUSH_PUBLIC_KEY : null });
    }
    if (!['enable', 'disable', 'status', 'test', 'tick'].includes(action)) return respond(404, {});
    if (request.method !== 'POST') return respond(405, {});
    if (!enabled) return respond(503, {});
    if (action === 'tick') {
      const provided = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${PUSH_JOB_KEY}`);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return respond(401, {});
    } else if (request.headers.origin !== origin) {
      return respond(403, {});
    }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') return respond(415, {});
    const length = Number(request.headers['content-length']);
    if (!Number.isInteger(length) || length <= 0 || length > 4096) return respond(400, {});
    const body = await readJson(request).catch(() => null);
    if (!body) return respond(400, {});
    const result = queue.then(() => transact(action, body));
    queue = result.catch(() => undefined);
    const [status, data] = await result;
    respond(status, data);
  };
}
