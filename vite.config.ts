import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { localWorker } from './worker/local-dev';

export default defineConfig(({ command, mode, isPreview }) => ({
  plugins: [
    react(),
    command === 'serve' && mode !== 'worker' && !isPreview ? localWorker() : cloudflare(),
    {
      name: 'exclude-local-worker-secrets',
      apply: 'build',
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          delete bundle['.dev.vars'];
        },
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    fs: {
      deny: ['**/.env*', '**/.dev.vars*', '**/*.env', '**/*.env.*',
        '**/*.{crt,pem,key,p12,pfx}', '**/.git/**', '**/staticdata/**'],
    },
  },
}));
