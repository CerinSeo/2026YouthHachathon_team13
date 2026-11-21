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

test('live historical demo renders a traceable walking comparison', async ({ page }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
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
