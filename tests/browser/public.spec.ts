import { test, expect } from '@playwright/test';
test('homepage and intake navigation render',async({page})=>{
 await page.goto('/');await expect(page).toHaveTitle(/TD Studios/);
 for(const path of ['/mylar-printing','/custom-design-request']) {
  const response = await page.goto(path);expect(response?.status()).toBe(200);
  await expect(page.locator('main')).toBeVisible();
 }
});
test('protected route redirects and file boundaries',async({page,request})=>{
 await page.goto('/dashboard');await expect(page).toHaveURL(/\/login/);
 for(const path of ['/api/invoices/synthetic/pdf','/api/files/synthetic','/api/partner-job-files/synthetic','/api/gallery/designs?path=synthetic.png','/newpremades/image/synthetic']) {
  const response = await request.get(path);expect([401,404]).toContain(response.status());
 }
});
test('all galleries fail closed and legacy GSO follows designs gate',async({page,context,request})=>{
 await context.addCookies([{name:'designs_access',value:'granted',url:'http://127.0.0.1:3100'},{name:'td_gallery_designs',value:'forged',url:'http://127.0.0.1:3100'}]);
 for(const path of ['/designs','/gso','/newpremades','/premadedesigns','/taste-budz','/martyig','/mafiaterpz']) {
  await page.goto(path);await expect(page.getByLabel('Entry code')).toBeVisible();
 }
 expect((await request.get('/_next/image?url=https%3A%2F%2Ftbgyyyffbxveukbihnhp.supabase.co%2Fstorage%2Fv1%2Fobject%2Fsign%2Fx&w=640&q=75')).status()).toBe(400);
});
test('tools render and disabled worker fails clearly before reading file bytes',async({page,request})=>{
 for(const path of ['/tools/cutline-generator','/tools/8pc-mockup-generator','/tools/bag-mockup-grid']) {
  await page.goto(path);await expect(page.locator('h1')).toBeVisible();
 }
 const result = await request.post('/api/cutline/generate',{data:{files:[]}});
 expect(result.status()).toBe(503);expect(await result.json()).toHaveProperty('error');
});
test('clean-checkout password reset renders without a configured backend',async({page})=>{
 await page.goto('/reset-password');await expect(page.getByText('Password reset is not configured.')).toBeVisible();
});

test('local public image optimization still works',async({request})=>{
 const response=await request.get('/_next/image?url=%2Flogo.png&w=640&q=75');
 expect(response.status()).toBe(200);expect(response.headers()['content-type']).toMatch(/^image\//);
});
