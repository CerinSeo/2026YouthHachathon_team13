import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openDemo(page: Page, name: string) {
  await page.getByRole('button', { name: '메뉴' }).click();
  const menu = page.getByRole('dialog', { name: '메뉴' });
  await menu.getByText('경로 바로 열기', { exact: true }).click();
  await menu.getByRole('button', { name }).click();
}

test('mobile map, menu, and search stay usable with enlarged text', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.5665, longitude: 126.978 });
  await page.goto('/');
  const map = page.getByLabel('서울 도보 경로 지도');
  await expect(map).toBeVisible();
  expect((await map.boundingBox())!.height).toBeGreaterThan(300);
  await expect(page.getByRole('link', { name: '© OpenStreetMap' })).toBeVisible();
  await expect(page.getByText('경로 바로 열기', { exact: true })).toHaveCount(0);
  await expect(page.getByText('잠금화면 알림', { exact: true })).toHaveCount(0);
  for (const name of ['메뉴', '목적지 입력하기', '지도에서 현재 위치 보기', '지도 확대', '지도 축소']) {
    const bounds = await page.getByRole('button', { name }).boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(48);
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }
  await expect(page.getByText('현재 위치를 지도에 표시했어요.')).toBeAttached();
  await expect(map.locator('img.leaflet-tile[src*="/16/"]').first()).toBeAttached();
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
  await page.getByRole('button', { name: '목적지 입력하기' }).click();
  await expect(page.getByRole('heading', { name: '출발지와 목적지' })).toBeFocused();
  const inputs = page.locator('.route-inputs');
  await expect(inputs.getByRole('button', { name: /^출발지.*입력/ })).toBeVisible();
  const useCurrentLocation = inputs.getByRole('button', { name: '현재 위치를 출발지로' });
  await useCurrentLocation.click();
  await expect(inputs.getByRole('button', { name: /^출발지.*현재 위치/ })).toBeVisible();
  await expect(useCurrentLocation).toHaveCount(0);
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  const destinationInput = page.getByRole('button', { name: /^목적지.*입력/ });
  await destinationInput.click();
  const scrollsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrollsHorizontally).toBe(false);
  await expect(page.getByLabel('목적지 검색')).toBeVisible();
  await expect(page.getByRole('button', { name: '지도에서 선택' })).toBeVisible();
  await expect(page.getByText('추천 장소', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('양재');
  await page.getByRole('button', { name: '검색어 지우기' }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(destinationInput).toBeFocused();
  await destinationInput.click();
  await page.getByRole('button', { name: '지도에서 선택' }).click();
  await map.click({ position: { x: 80, y: 80 } });
  await expect(page.getByRole('button', { name: '이 위치 사용' })).toBeEnabled();
  await page.getByRole('button', { name: '이 위치 사용' }).click();
  await expect(inputs.getByRole('button', { name: /^목적지.*지도에서 선택한 위치/ })).toBeFocused();
  await expect(page.getByRole('heading', { name: '출발지와 목적지' })).toBeVisible();
});

test('people can search real places, compare a route, and open live guidance from the map home', async ({ page, context }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.483592, longitude: 127.036065, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: '목적지 입력하기' }).click();
  await page.getByRole('button', { name: /^목적지.*입력/ }).click();
  await page.getByRole('searchbox', { name: '목적지 검색' }).fill('양재동우체국');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('list', { name: '검색 결과' }).getByRole('button', { name: /^양재동우체국/ }).first().click();
  await page.getByRole('button', { name: /^출발지.*입력/ }).click();
  await page.getByRole('searchbox', { name: '출발지 검색' }).fill('양재역 4번출구');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('list', { name: '검색 결과' }).getByRole('button', { name: /^양재역 4번출구/ }).first().click();
  await page.getByRole('button', { name: '경로 확인하기' }).click();
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
  await expect(page.getByText(/과거 예보/)).toHaveCount(0);
  await page.getByRole('button', { name: '안내 시작' }).click();
  await expect(page.locator('.guidance-top').getByRole('heading', { name: '도보 안내' })).toBeFocused();
  await expect(page.getByRole('heading', { name: '양재동우체국까지' })).toBeVisible();
  await page.getByRole('button', { name: '안내 종료' }).click();
  await expect(page.getByRole('button', { name: '안내 시작' })).toBeFocused();
});

test('a background push registers a system notification through the service worker', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await context.grantPermissions(['notifications']);
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('button', { name: '메뉴' }).click();
  await page.getByText('알림 설정', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '잠금화면 알림' })).toBeVisible();
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
      title: '양재 도보 경로',
      body: '양재역 4번 출구 → 양재동우체국. 과거 예보로 계산한 추천 경로를 확인하세요.',
    }),
  });
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.getNotifications()).map(({ title, body }) => ({ title, body }));
  })).toContainEqual({
    title: '양재 도보 경로',
    body: '양재역 4번 출구 → 양재동우체국. 과거 예보로 계산한 추천 경로를 확인하세요.',
  });
});

test('the device notification link opens the real Yangjae historical comparison', async ({ page }) => {
  test.skip(process.env.LIVE_DEMO_TEST !== '1', 'Requires local TMAP key and upstream connections');
  await page.goto('/?notice=yangjae-demo');
  await expect(page.getByRole('button', { name: '목적지 입력하기' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByText(/양재역 4번출구 → 양재동우체국/)).toBeVisible();
  await expect(page.getByText(/과거 예보 · 결빙 위험/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /추천 경로/ })).toBeChecked();
  await expect(page.getByText(/결빙 위험 구간 [1-9]/)).toBeVisible();
  await expect(page.locator('.marker--start .place-pin')).toBeVisible();
  await expect(page.locator('.marker--destination .place-pin')).toBeVisible();
  await expect(page.locator('.marker--risk').first()).toHaveText('❄︎');
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
  await openDemo(page, '양재역에서 우체국까지');
  await expect(page.getByRole('heading', { name: '출발지와 목적지' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '경로 확인하기' }).click();
  await expect(page.getByRole('heading', { name: '경로 결과' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/과거 예보 · 결빙 위험/)).toBeVisible();
  await expect(page.getByText(/과거 기상 재생|기상 기준|기상 시각/)).toHaveCount(0);
  const extraTime = page.getByText(/일반 경로보다 (?:약 [1-9]\d*분|1분 미만) 더 걸려요/);
  await expect(extraTime).toBeVisible();
  await page.getByRole('radio', { name: /일반 경로/ }).check();
  await expect(extraTime).toHaveCount(0);
  await page.getByRole('radio', { name: /추천 경로/ }).check();
  await expect(page.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /추천 경로/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
  await expect(page.getByText(/결빙 위험 구간 [1-9]/)).toBeVisible();
  await expect(page.getByText(/강수량|결빙 점수|임계값/)).toHaveCount(0);
  await page.getByRole('button', { name: '경로 단계 보기' }).click();
  await expect(page.getByRole('heading', { name: '경로 단계' })).toBeFocused();
  await expect(extraTime).toBeVisible();
  await expect(page.locator('.guidance-top').getByRole('button', { name: '다시 듣기' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: '출발지와 목적지' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: '경로 확인하기' }).click();
    await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
    await expect(page.getByText(/과거 예보 · 결빙 위험/)).toBeVisible();
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
  await openDemo(page, '양재역에서 우체국까지');
  await expect(page.getByRole('heading', { name: '출발지와 목적지' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '경로 확인하기' }).click();
  await expect(page.getByText('일반 경로만 볼 수 있어요.')).toBeVisible();
  await expect(page.getByRole('radio', { name: /추천 경로/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /일반 경로/ })).toBeVisible();
});
