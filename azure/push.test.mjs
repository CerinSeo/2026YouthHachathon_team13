import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { generateVAPIDKeys } from 'web-push';
import { createPushHandler } from './push.mjs';

test('a device opts in, receives test and scheduled pushes, and can cancel future pushes', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'bingbingzero-push-test-'));
  const storePath = join(home, 'subscriptions.json');
  const keys = generateVAPIDKeys();
  const origin = 'https://bingbingzero.example';
  const sent = [];
  const scheduled = [];
  let time = Date.parse('2026-02-02T04:00:00Z');
  const initialTime = time;
  const env = {
    PUSH_PUBLIC_KEY: keys.publicKey, PUSH_PRIVATE_KEY: keys.privateKey,
    PUSH_WORKFLOW_URL: 'https://workflow.example', PUSH_JOB_KEY: 'unit-test-only',
    PUSH_ORIGIN: origin, PUSH_STORE_PATH: storePath,
  };
  const adapter = {
    now: () => time,
    send: async (_subscription, message) => sent.push(JSON.parse(message)),
    start: async (_url, request) => {
      scheduled.push(JSON.parse(request.body));
      return { ok: true };
    },
  };
  let handler = createPushHandler(env, adapter);
  const server = createServer((req, res) => void handler(req, res, new URL(req.url, origin)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await unlink(storePath).catch(() => undefined);
    await rmdir(home);
  });
  const base = `http://127.0.0.1:${server.address().port}/api/push/`;
  function post(action, body, headers = { Origin: origin }) {
    return fetch(base + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }
  const job = { Authorization: 'Bearer unit-test-only' };
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-device',
    keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 3).toString('base64url') },
  };
  assert.equal((await post('enable', { subscription }, { Origin: 'https://another.example' })).status, 403);
  assert.equal((await post('enable', { subscription: { ...subscription, endpoint: 'https://127.0.0.1/' } })).status, 400);
  const { id, endsAt } = await (await post('enable', { subscription })).json();
  assert.equal(endsAt, initialTime + 3_600_000);
  assert.deepEqual(scheduled, [{ id, startedAt: new Date(initialTime).toISOString() }]);
  assert.equal((await (await post('enable', { subscription })).json()).id, id);
  assert.equal(scheduled.length, 1);
  assert.equal(sent.length, 0);

  assert.equal((await post('test', { id })).status, 200);
  assert.match(sent[0].title, /^\[시연\]/);
  assert.equal((await post('test', { id })).status, 429);
  assert.equal((await post('tick', { id, sequence: 1 })).status, 401);
  time += 599_999;
  assert.equal((await post('tick', { id, sequence: 1 }, job)).status, 409);
  time += 1;
  handler = createPushHandler(env, adapter);
  assert.equal((await post('tick', { id, sequence: 1 }, job)).status, 200);
  assert.equal((await post('tick', { id, sequence: 1 }, job)).status, 200);
  assert.equal(sent.length, 2);
  time += 600_000;
  assert.equal((await post('tick', { id, sequence: 2 }, job)).status, 200);
  assert.equal(sent.length, 3);

  assert.equal((await post('disable', { id })).status, 200);
  time += 600_000;
  assert.equal((await post('tick', { id, sequence: 3 }, job)).status, 200);
  assert.equal(sent.length, 3);

  const second = await (await post('enable', { subscription })).json();
  time = second.endsAt;
  assert.equal((await post('tick', { id: second.id, sequence: 6 }, job)).status, 200);
  assert.equal(sent.length, 4);
  assert.equal((await post('status', { id: second.id })).status, 404);
});
