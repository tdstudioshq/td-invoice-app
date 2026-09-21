import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { composeCutlinePdf } from '../lib/cutline/compose';

test('cutline rendering preserves the print template page dimensions', async () => {
  const image = await sharp({ create: { width: 1200, height: 1500, channels: 4, background: '#ff000080' } }).png().toBuffer();
  const pdf = await PDFDocument.load(await composeCutlinePdf(image, { presetId: 'cut-line-file' }));
  const template = await PDFDocument.load(await readFile('public/assets/cutlines/cut-line-file.pdf'));
  assert.deepEqual(pdf.getPage(0).getSize(), template.getPage(0).getSize());
});

test('renderer rejects malformed bytes and excessive decoded dimensions', async () => {
  await assert.rejects(composeCutlinePdf(Buffer.from('invalid image')));
  const huge = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(composeCutlinePdf(huge));
});
