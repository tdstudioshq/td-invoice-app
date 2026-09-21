import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedForm, UploadTooLargeError } from '../lib/http/bounded-form';
import { MAX_DIRECT_BYTES, directUploadError } from '../lib/http/upload-limits';

test('valid multipart fields and file bytes survive bounded parsing', async () => {
  const form = new FormData();
  form.set('preset', 'cut-line-file');
  form.set('file', new Blob(['synthetic'], { type: 'image/png' }), 'art.png');
  assert.equal(directUploadError(form), null);
  const parsed = await readBoundedForm(new Request('http://localhost', { method: 'POST', body: form }));
  assert.equal(parsed.get('preset'), 'cut-line-file');
  assert.equal(await (parsed.get('file') as File).text(), 'synthetic');
});

test('oversized streams are rejected even without a truthful Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '10' }]) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); },
      cancel() { cancelled = true; },
    });
    const req = new Request('http://localhost', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
    await assert.rejects(readBoundedForm(req), UploadTooLargeError);
    assert.equal(cancelled, true);
  }
});

test('client budget includes combined files and multipart framing', () => {
  const form = new FormData();
  form.set('a', new Blob([new Uint8Array(MAX_DIRECT_BYTES / 2)]), 'a.png');
  assert.equal(directUploadError(form), null);
  form.set('b', new Blob([new Uint8Array(MAX_DIRECT_BYTES / 2)]), 'b.png');
  assert.ok(directUploadError(form));
});
