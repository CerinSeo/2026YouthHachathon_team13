import { expect, test } from '@playwright/test';

test('mobile home and search keep controls visible with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /안전 경로를 한눈에/ })).toBeVisible();
  await page.getByRole('button', { name: '목적지 검색하기' }).click();
  await expect(page.getByRole('heading', { name: '목적지 선택' })).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const scrollsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrollsHorizontally).toBe(false);
  await expect(page.getByLabel('목적지 검색')).toBeVisible();
  await expect(page.getByRole('button', { name: '지도에서 선택' })).toBeVisible();
});

test('a background push registers a system notification through the service worker', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await context.grantPermissions(['notifications']);
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('heading', { name: '잠금화면 결빙 알림 시연' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const cdp = await context.newCDPSession(page);
  let registrationId: string | undefined;
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
    registrationId = registrations.find((registration) => !registration.isDeleted)?.registrationId;
  });
  await cdp.send('ServiceWorker.enable');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => registrationId).toBeTruthy();
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(page.url()).origin, registrationId: registrationId!,
    data: JSON.stringify({
      title: '[시연] 양재 도보 경로에 결빙이 예상돼요',
      body: '양재역 4번 출구 → 양재동우체국. 눌러서 과거 예보로 계산한 안전 경로를 확인하세요.',
    }),
  });
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.getNotifications()).map(({ title, body }) => ({ title, body }));
  })).toContainEqual({
    title: '[시연] 양재 도보 경로에 결빙이 예상돼요',
    body: '양재역 4번 출구 → 양재동우체국. 눌러서 과거 예보로 계산한 안전 경로를 확인하세요.',
  });
});

test('the device notification link opens the real Yangjae historical comparison', async ({ page }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
  await page.goto('/?notice=yangjae-demo');
  await expect(page.getByRole('heading', { name: /안전 경로를 한눈에/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByText(/양재역 4번출구 → 양재동우체국/)).toBeVisible();
  await expect(page.getByText('과거 기상 재생', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /안전 경로/ })).toBeChecked();
  await expect(page.getByText(/결빙 위험 예상구간 [1-9]/)).toBeVisible();
  await expect(page).toHaveURL('/');
});

test('live historical demo renders a traceable walking comparison', async ({ page }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => undefined,
      speak: (utterance: SpeechSynthesisUtterance) => {
        document.documentElement.dataset.spoken = `${utterance.lang} ${utterance.text}`;
      },
    } });
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern: number | number[]) => {
      document.documentElement.dataset.vibration = JSON.stringify(pattern);
      return true;
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '양재 시연 열기' }).click();
  await expect(page.getByRole('heading', { name: '경로 확인' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '이 경로 비교하기' }).click();
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('과거 기상 재생', { exact: true })).toBeVisible();
  await expect(page.getByText(/기상 기준/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /안전 경로/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
  await expect(page.getByText(/결빙 위험 예상구간 [1-9]/)).toBeVisible();
  await expect(page.getByText(/강수량|결빙 점수|임계값/)).toHaveCount(0);
  await page.getByRole('button', { name: '안내 미리보기' }).click();
  await expect(page.getByRole('heading', { name: '안내 미리보기' })).toBeFocused();
  await page.getByRole('button', { name: '다시 듣기' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', /^ko-KR .+/);
  await expect(page.locator('html')).toHaveAttribute('data-vibration', /^\[|^180$/);
  await page.getByRole('button', { name: '안내 종료' }).click();
  await expect(page.getByRole('button', { name: '안내 미리보기' })).toBeFocused();
});

for (const name of ['혜화역에서 병원까지', '시청역에서 서울광장까지']) {
  test(`replays the historical walking comparison for ${name}`, async ({ page }) => {
    test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
    await page.goto('/');
    await page.getByText('다른 과거 시연 경로', { exact: true }).click();
    await page.getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { name: '경로 확인' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: '이 경로 비교하기' }).click();
    await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
    await expect(page.getByText('과거 기상 재생', { exact: true })).toBeVisible();
  });
}

test('blocks local credential and original input files', async ({ request }) => {
  for (const path of ['/.dev.vars', '/staticdata/.env.local', '/staticdata/surface.json']) {
    expect((await request.head(path)).status()).toBe(403);
  }
});

test('preserves the ordinary route when the weather provider is unavailable', async ({ page }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key');
  await page.route('**/data/weather/**', (route) => route.abort());
  await page.route('**/api/weather/hourly?*', (route) => route.fulfill({ status: 503 }));
  await page.goto('/');
  await page.getByRole('button', { name: '양재 시연 열기' }).click();
  await expect(page.getByRole('heading', { name: '경로 확인' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '이 경로 비교하기' }).click();
  await expect(page.getByText('지금은 일반 경로만 볼 수 있어요.')).toBeVisible();
  await expect(page.getByRole('radio', { name: /안전 경로/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
});
