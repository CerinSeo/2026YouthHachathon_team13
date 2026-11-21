import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { basename } from 'node:path';

const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root);
const output = 'dist/azure-app';
rmSync(file(output), { recursive: true, force: true });
mkdirSync(file(output), { recursive: true });
copyFileSync(file('azure/server.mjs'), file(`${output}/server.mjs`));
copyFileSync(file('azure/push.mjs'), file(`${output}/push.mjs`));
copyFileSync(file('azure/package.json'), file(`${output}/package.json`));
copyFileSync(file('azure/package-lock.json'), file(`${output}/package-lock.json`));
copyFileSync(file('dist/bingbingzero/index.js'), file(`${output}/worker.js`));
cpSync(file('dist/client'), file(`${output}/public`), {
  recursive: true,
  filter: (source) => !basename(source).startsWith('.'),
});
