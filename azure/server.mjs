import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from './worker.js';
import { createPushHandler } from './push.mjs';

const publicRoot = fileURLToPath(new URL('./public', import.meta.url));
const handlePush = createPushHandler(process.env);
const mime = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.sha256': 'text/plain; charset=UTF-8',
  '.png': 'image/png',
};

async function serve(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/push/')) {
    await handlePush(request, response, url);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const upstream = await handleRequest(new Request(url, { method: request.method }), {
      TMAP_APP_KEY: process.env.TMAP_APP_KEY,
    });
    response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    response.end(await upstream.text());
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filename = resolve(publicRoot, `.${pathname}`);
  if (!filename.startsWith(publicRoot + sep) || pathname.split('/').some((part) => part.startsWith('.'))) {
    response.writeHead(404).end();
    return;
  }
  const entry = await stat(filename).catch(() => null);
  if (!entry?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime[extname(filename)] || 'application/octet-stream',
    'Content-Length': entry.size,
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filename).on('error', () => response.destroy()).pipe(response);
}

const port = Number(process.env.PORT ?? 8080);
createServer((request, response) => {
  void serve(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500).end();
    else response.destroy();
  });
}).listen(port, process.env.HOST ?? '0.0.0.0');
