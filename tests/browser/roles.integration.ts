import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { spawn, type ChildProcess } from 'node:child_process';
import sharp from 'sharp';
const url=process.env.SUPABASE_URL ?? '';
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) throw new Error('Local Supabase required');
const service=createClient(url,process.env.SUPABASE_SECRET_KEY!);
const password='Synthetic-test-password-123!';
const ids:Record<string,string>={};const tokens:Record<string,string>={};
let invoiceId:string, clientId:string, worker:ChildProcess;
test.beforeAll(async()=>{
 for(const role of ['admin','customer','portal','partner']){
  const created=await service.auth.admin.createUser({email:`${role}@integration.test`,password,email_confirm:true});
  if(created.error) throw created.error;ids[role]=created.data.user.id;
  const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const login=await client.auth.signInWithPassword({email:`${role}@integration.test`,password});
  if(login.error) throw login.error;tokens[role]=login.data.session!.access_token;
 }
 const must=async(p:PromiseLike<{error:unknown}>)=>{const r=await p;if(r.error)throw r.error;};
 await must(service.from('workspace_owner').insert({singleton:true,owner_id:ids.admin}));
 await must(service.from('workspace_admins').insert({user_id:ids.admin}));
 const client=await service.from('clients').insert({company_name:'Synthetic client',owner_id:ids.admin}).select().single();if(client.error)throw client.error;clientId=client.data.id;
 await must(service.from('client_users').insert({client_id:clientId,user_id:ids.portal,owner_id:ids.admin,can_upload:true}));
 const company=await service.from('partner_companies').insert({name:'Synthetic partner',slug:'test-partner',job_prefix:'TP'}).select().single();if(company.error)throw company.error;
 await must(service.from('partner_users').insert({user_id:ids.partner,company_id:company.data.id}));
 const invoice=await service.from('invoices').insert({client_id:clientId,owner_id:ids.admin,status:'sent'}).select().single();if(invoice.error)throw invoice.error;invoiceId=invoice.data.id;
 await service.storage.createBucket('GSO',{public:false});
 const image=await sharp({create:{width:100,height:100,channels:4,background:'#ff000080'}}).png().toBuffer();
 const uploaded=await service.storage.from('GSO').upload('synthetic.png',image,{contentType:'image/png'});if(uploaded.error)throw uploaded.error;
 worker=spawn(process.execPath,['--import=tsx','worker/run.mts'],{env:process.env,stdio:'ignore'});
});
test.afterAll(async()=>{worker?.kill();});
test('direct API authorization and invoice PDF boundaries',async({request,page})=>{
 for(const role of ['customer','portal','partner','admin']){
  const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${tokens[role]}`}}});
  const result=await client.from('clients').select('id');expect(result.error).toBeNull();
  expect(result.data?.length).toBe(['portal','admin'].includes(role)?1:0);
  if(role!=='admin') expect((await client.from('clients').insert({company_name:'Forbidden',owner_id:ids[role]})).error).not.toBeNull();
  const pdf=await request.get(`/api/invoices/${invoiceId}/pdf`,{headers:{Authorization:`Bearer ${tokens[role]}`}});
  expect(pdf.status()).toBe(['portal','admin'].includes(role)?200:404);
  if(pdf.ok()) expect((await pdf.body()).subarray(0,4).toString()).toBe('%PDF');
 }
 await page.goto('/login');
 await page.locator('input[type=email]').fill('customer@integration.test');
 await page.locator('input[type=password]').fill(password);
 await page.getByRole('button',{name:/sign in/i}).click();
 await expect(page).toHaveURL(/onboarding|account/);
 await page.goto('/invoices');await expect(page).toHaveURL(/onboarding|account/);
});
test('private gallery legitimate viewing, direct denial and durable throttle',async({page,request})=>{
 await page.goto('/designs');for(const digit of ['9','8','7','6']) await page.getByRole('button',{name:digit,exact:true}).click();
 await expect(page.getByLabel('Entry code')).toHaveCount(0);
 const asset=await page.request.get('/api/gallery/designs?path=synthetic.png');expect(asset.status()).toBe(200);
 const direct=await request.get(`${url}/storage/v1/object/public/GSO/synthetic.png`);expect(direct.ok()).toBe(false);
 const denied=await request.get('/api/gallery/designs?path=synthetic.png');expect(denied.status()).toBe(401);
 for(let i=0;i<10;i++) await service.rpc('consume_security_quota',{p_key:'test-atomic',p_limit:10,p_seconds:600});
 expect((await service.rpc('consume_security_quota',{p_key:'test-atomic',p_limit:10,p_seconds:600})).data).toBe(false);
});
test('large direct upload, idempotent commit and signed download',async({request})=>{
 const bytes=await sharp({create:{width:1400,height:1400,channels:4,background:'#0088ff80'}}).png({compressionLevel:0}).toBuffer();
 expect(bytes.length).toBeGreaterThan(4.5*1024*1024);
 const ticket=await request.post('/api/cutline/generate',{data:{fields:{preset:'cut-line-file'},files:[{field:'file',name:'synthetic.png',type:'image/png',size:bytes.length}]}});
 expect(ticket.status()).toBe(201);const job=await ticket.json();
 expect((await request.put(job.uploads[0].url,{data:bytes,headers:{'Content-Type':'image/png'}})).ok()).toBe(true);
 const headers={Authorization:`Bearer ${job.token}`};
 expect((await request.get(`/api/processing/${job.id}`)).status()).toBe(401);
 for(let i=0;i<2;i++)expect((await request.post(`/api/processing/${job.id}`,{headers})).ok()).toBe(true);
 await expect.poll(async()=> (await (await request.get(`/api/processing/${job.id}`,{headers})).json()).state,{timeout:90000,intervals:[1000]}).toBe('complete');
 const state=await (await request.get(`/api/processing/${job.id}`,{headers})).json();
 const pdf=await request.get(state.url);expect((await pdf.body()).subarray(0,4).toString()).toBe('%PDF');
});

test('admin invoice creation through the browser and authorized PDF download',async({page})=>{
 await page.goto('/login');await page.locator('input[type=email]').fill('admin@integration.test');await page.locator('input[type=password]').fill(password);
 await page.getByRole('button',{name:/sign in/i}).click();await expect(page).toHaveURL(/dashboard/);
 await page.goto('/invoices/new');await page.getByPlaceholder('Type a client name').fill('Synthetic client');
 await page.getByPlaceholder('Design services').first().fill('Browser synthetic item');
 await page.getByRole('button',{name:/create invoice/i}).click();
 await expect(page).toHaveURL(/\/invoices\/[a-f0-9-]+$/);
 const id = new URL(page.url()).pathname.split('/').pop();
 const pdf = await page.request.get(`/api/invoices/${id}/pdf`);expect(pdf.status()).toBe(200);
 expect((await pdf.body()).subarray(0,4).toString()).toBe('%PDF');
});

test('portal direct upload and private download preserve client boundaries',async({page,request})=>{
 const portal=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${tokens.portal}`}}});
 const path=`${clientId}/uploads/synthetic.png`;
 const bytes=await sharp({create:{width:100,height:100,channels:4,background:'#ffffff'}}).png().toBuffer();
 expect((await portal.storage.from('client-files').upload(path,bytes,{contentType:'image/png'})).error).toBeNull();
 const row=await portal.from('client_files').insert({owner_id:ids.admin,client_id:clientId,category:'uploads',storage_path:path,name:'synthetic.png',mime_type:'image/png',size_bytes:bytes.length}).select().single();
 expect(row.error).toBeNull();
 await page.goto('/login');await page.locator('input[type=email]').fill('portal@integration.test');await page.locator('input[type=password]').fill(password);
 await page.getByRole('button',{name:/sign in/i}).click();await expect(page).toHaveURL(/portal/);
 expect((await page.request.get(`/api/files/${row.data.id}`)).status()).toBe(200);
 expect((await request.get(`/api/files/${row.data.id}`)).status()).toBe(401);
 expect((await request.get(`${url}/storage/v1/object/public/client-files/${path}`)).ok()).toBe(false);
});
