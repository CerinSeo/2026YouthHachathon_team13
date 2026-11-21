import { expect, it } from 'vitest';
import { handleRequest, type Transport } from '../worker/index';

it('rejects upstream redirects without following them', async () => {
  const transport: Transport = async (url, options) => {
    expect(String(url)).toMatch(/^https:\/\/apis\.openapi\.sk\.com\/tmap\/pois\?/);
    expect(options?.redirect).toBe('manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.org/' } });
  };
  const result = await handleRequest(new Request('http://localhost/api/places/search?q=양재'),
    { TMAP_APP_KEY: 'test-value' }, transport);
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
});
