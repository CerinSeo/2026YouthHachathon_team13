import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5173';
const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000,
  use: { baseURL, launchOptions: executablePath ? { executablePath } : {} },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
