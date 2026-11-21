import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv, promisify } from 'node:util';
import type { Plugin } from 'vite';
import { handleRequest, type Transport } from './index';

const run = promisify(execFile);
const weatherHosts = new Set(['api.open-meteo.com', 'historical-forecast-api.open-meteo.com']);

const localTransport: Transport = async (input, options) => {
  if (input instanceof URL && input.protocol === 'https:' && weatherHosts.has(input.hostname)) {
    const { stdout } = await run('curl', ['-fsS', '--compressed', '--max-time', '8', input.toString()], {
      maxBuffer: 1024 * 1024, signal: options?.signal ?? undefined,
    });
    return new Response(stdout, { headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(input, options);
};

export function localWorker(): Plugin {
  return {
    name: 'local-worker-transport',
    configureServer(server) {
      const candidates = ['.dev.vars', 'staticdata/.env.local'];
      const filename = candidates.find(existsSync);
      const local = filename ? parseEnv(readFileSync(filename, 'utf8')) : {};
      const env = { TMAP_APP_KEY: process.env.TMAP_APP_KEY || local.TMAP_APP_KEY };
      server.middlewares.use((request, response, next) => {
        const path = request.url;
        if (!path?.startsWith('/api/')) return next();
        void handleRequest(new Request(`http://127.0.0.1${path}`, { method: request.method }), env, localTransport)
          .then(async (out) => {
            response.statusCode = out.status;
            out.headers.forEach((value, name) => response.setHeader(name, value));
            response.end(await out.text());
          }).catch(() => {
            response.statusCode = 503;
            response.end();
          });
      });
    },
  };
}
