import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { renderInvoicePdf } from '../lib/pdf/invoice-pdf';
async function render(kind: string, fields: Record<string,string>, image: Buffer, field = 'file') {
 const dir = await mkdtemp(`${tmpdir()}/td-test-render-`);
 try {
  await writeFile(`${dir}/manifest.json`,JSON.stringify({kind,fields,files:[{field,name:'synthetic.png',size:image.length,type:'image/png'}]}));
  await writeFile(`${dir}/input-0`, image);
  const code = await new Promise<number|null>((resolve,reject) => {
   const child = spawn(process.execPath,['--conditions=react-server','--import=tsx','worker/process.mts',dir],{env:{PATH:process.env.PATH,NODE_ENV:"test"},stdio:['ignore','ignore','pipe']});
   let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
   const timer = setTimeout(()=>child.kill('SIGKILL'),60000);
   child.on('error',reject);child.on('exit', code=>{clearTimeout(timer);if(code) console.log(stderr.slice(-1000));resolve(code);});
  });
  if (code !== 0) return null;
  return { bytes: await readFile(`${dir}/output`), type: await readFile(`${dir}/type`,'utf8') };
 } finally { await rm(dir,{recursive:true,force:true}); }
}
test('worker creates print cutline PDF and preserves template page size', async () => {
 const image = await sharp({create:{width:1200,height:1425,channels:4,background:'#ff000080'}}).png().toBuffer();
 const result = await render('cutline',{preset:'cut-line-file'},image);
 assert.ok(result); assert.equal(result.type,'application/pdf');
 const pdf = await PDFDocument.load(result.bytes);
 const template = await PDFDocument.load(await readFile('public/assets/cutlines/cut-line-file.pdf'));
 assert.deepEqual(pdf.getPage(0).getSize(),template.getPage(0).getSize());
});
test('worker decodes files larger than Vercel payload limit and renders transparent sheet',async()=>{
 // Uncompressed synthetic PNG >4.5 MB: actual image data, not a fake size field.
 const image = await sharp({create:{width:1300,height:1400,channels:4,background:'#0088ff80'}}).png({compressionLevel:0}).toBuffer();
 assert.ok(image.length > 4.5*1024*1024);
 const result = await render('mockup-sheet',{meta:JSON.stringify({format:'png',dpi:150,background:'transparent',placements:[{slotId:'1',fitMode:'contain',transform:{offsetX:0,offsetY:0,scale:1,rotation:0}}]})},image,'file:1');
 assert.ok(result); const metadata = await sharp(result.bytes).metadata();
 assert.equal(metadata.width,2700); assert.equal(metadata.height,1575);assert.equal(metadata.hasAlpha,true);
});
test('worker renders bag grid and rejects malformed or excessive decoded dimensions',async()=>{
 const image = await sharp({create:{width:200,height:250,channels:3,background:'#00ff00'}}).png().toBuffer();
 assert.ok(await render('bag-mockup-grid',{meta:JSON.stringify({format:'pdf',dpi:72,order:['one']})},image,'file:one'));
 assert.equal(await render('cutline',{},Buffer.from('not an image')),null);
 const huge = await sharp({create:{width:7000,height:7000,channels:3,background:'#fff'}}).png().toBuffer();
 assert.equal(await render('cutline',{},huge),null);
});
test('invoice PDF renderer produces a readable letter-size document',async()=>{
 const bytes = await renderInvoicePdf({company:{name:'Synthetic Studio'},client:{name:'Synthetic client'},invoiceNumber:'TEST-0001',status:'sent',statusLabel:'Sent',issueDate:'Sep 17, 2026',dueDate:'Sep 20, 2026',items:[{description:'Synthetic print',quantity:2,unitPrice:10}],subtotal:20,discountRate:0,discountAmount:0,taxRate:0,taxAmount:0,total:20,amountPaid:0,balanceDue:20});
 const pdf = await PDFDocument.load(bytes);assert.deepEqual(pdf.getPage(0).getSize(),{width:612,height:792});
});
