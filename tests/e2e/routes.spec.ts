import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openDemo(page: Page, name: string) {
  await page.getByRole('button', { name: '메뉴' }).click();
  const menu = page.getByRole('dialog', { name: '메뉴' });
  await menu.getByText('시연 경로', { exact: true }).click();
  await menu.getByRole('button', { name }).click();
}

test('mobile map, menu, and search stay usable with enlarged text', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.5665, longitude: 126.978 });
  await page.goto('/');
  const map = page.getByLabel('서울 도보 경로 지도');
  await expect(map).toBeVisible();
  expect((await map.boundingBox())!.height).toBeGreaterThan(500);
  await expect(page.getByText('시연 경로', { exact: true })).toHaveCount(0);
  await expect(page.getByText('잠금화면 결빙 알림 시연', { exact: true })).toHaveCount(0);
  for (const name of ['메뉴', '목적지 검색하기', '지도에서 현재 위치 보기', '지도 확대', '지도 축소']) {
    const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(48);
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole('button', { name: '지도에서 현재 위치 보기' }).click();
  await expect(page.getByText('현재 위치를 지도에 표시했어요.')).toBeAttached();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const menuButton = page.getByRole('button', { name: '메뉴' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: '메뉴' });
  await expect(menu.getByRole('heading', { name: '메뉴' })).toBeFocused();
  const menuSize = await menu.evaluate((dialog) => ({ width: dialog.clientWidth, scrollWidth: dialog.scrollWidth }));
  expect(menuSize.scrollWidth).toBeLessThanOrEqual(menuSize.width);
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: '닫기' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();
  await page.getByRole('button', { name: '목적지 검색하기' }).click();
  await expect(page.getByRole('heading', { name: '목적지 선택' })).toBeFocused();
  const scrollsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrollsHorizontally).toBe(false);
  await expect(page.getByLabel('목적지 검색')).toBeVisible();
  await expect(page.getByRole('button', { name: '지도에서 선택' })).toBeVisible();
  await expect(page.getByText('추천 장소', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('양재');
  await page.getByRole('button', { name: '검색어 지우기' }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('searchbox')).toBeFocused();
});

test('people can search real places and compare a route from the map home', async ({ page }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '목적지 검색하기' }).click();
  await page.getByRole('searchbox', { name: '목적지 검색' }).fill('양재동우체국');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('list', { name: '검색 결과' }).getByRole('button', { name: /^양재동우체국/ }).first().click();
  await page.getByRole('button', { name: '출발지 선택', exact: true }).click();
  await page.getByRole('searchbox', { name: '출발지 검색' }).fill('양재역 4번출구');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('list', { name: '검색 결과' }).getByRole('button', { name: /^양재역 4번출구/ }).first().click();
  await page.getByRole('button', { name: '이 경로 비교하기' }).click();
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
  await expect(page.getByText('과거 기상 재생', { exact: true })).toHaveCount(0);
});

test('a background push registers a system notification through the service worker', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await context.grantPermissions(['notifications']);
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('button', { name: '메뉴' }).click();
  await page.getByText('알림 설정', { exact: true }).click();
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
  await expect(page.getByRole('button', { name: '목적지 검색하기' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByText(/양재역 4번출구 → 양재동우체국/)).toBeVisible();
  await expect(page.getByText('과거 기상 재생', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /안전 경로/ })).toBeChecked();
  await expect(page.getByText(/결빙 위험 예상구간 [1-9]/)).toBeVisible();
  await expect(page).toHaveURL('/');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole('link', { name: '경로 요약으로 건너뛰기' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '경로 요약' })).toBeFocused();
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
  await openDemo(page, '양재 시연 열기');
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
  await page.getByRole('button', { name: '경로 단계 보기' }).click();
  await expect(page.getByRole('heading', { name: '경로 단계' })).toBeFocused();
  await page.getByRole('button', { name: '다시 듣기' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken', /^ko-KR .+/);
  await expect(page.locator('html')).toHaveAttribute('data-vibration', /^\[|^180$/);
  await page.getByRole('button', { name: '안내 종료' }).click();
  await expect(page.getByRole('button', { name: '경로 단계 보기' })).toBeFocused();
});

for (const name of ['혜화역에서 병원까지', '시청역에서 서울광장까지']) {
  test(`replays the historical walking comparison for ${name}`, async ({ page }) => {
    test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
    await page.goto('/');
    await openDemo(page, name);
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
  await openDemo(page, '양재 시연 열기');
  await expect(page.getByRole('heading', { name: '경로 확인' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '이 경로 비교하기' }).click();
  await expect(page.getByText('지금은 일반 경로만 볼 수 있어요.')).toBeVisible();
  await expect(page.getByRole('radio', { name: /안전 경로/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
});
