import { test, expect } from '@playwright/test';

test('homepage explains services and links to the intake on desktop and mobile', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page).toHaveTitle('TD Studios — Design & Packaging');
    await expect(page.locator('h1')).toHaveText('TD STUDIOS');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /packaging design/);
    await expect(page.getByRole('heading', { name: 'From your idea to your packaging.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View the portfolio' })).toHaveAttribute('href', '/portfolio');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`homepage-${viewport.width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Request a printing quote' }).click();
    await expect(page).toHaveURL(/\/mylar-printing$/);
    await expect(page.getByRole('heading', { name: 'Custom Mylar Printing', exact: true })).toBeVisible();
  }
});

test('crawlers receive public metadata routes and only public sitemap entries', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /portal');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('/mylar-printing');
  expect(xml).not.toContain('/dashboard');
});

test('protected routes and private image optimizer deny anonymous requests', async ({ page, request }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  for (const path of ['/api/invoices/synthetic/pdf', '/api/files/synthetic', '/api/mylar-artwork/synthetic', '/api/design-request-assets/synthetic']) {
    expect([401, 404]).toContain((await request.get(path)).status());
  }
  expect((await request.get('/_next/image?url=https%3A%2F%2Ftbgyyyffbxveukbihnhp.supabase.co%2Fstorage%2Fv1%2Fobject%2Fsign%2Fx&w=640&q=75')).status()).toBe(400);
});

test('image endpoints reject oversized payloads before decoding', async ({ request }) => {
  for (const tool of ['cutline', 'mockup-sheet', 'bag-mockup-grid']) {
    const response = await request.post(`/api/${tool}/generate`, { data: Buffer.alloc(4_100_000) });
    expect(response.status()).toBe(413);
    expect((await response.json()).error).toContain('4 MB');
  }
});
