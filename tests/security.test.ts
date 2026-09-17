import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession, SESSION_SECONDS } from '../lib/security/tokens';
import { manifestSchema } from '../lib/processing/schema';
const secret = 'synthetic-key-'.repeat(4), now = 1000000;
test('gallery sessions reject forged, expired and wrong-gallery tokens', () => {
 const token = signSession('designs', secret, now);
 assert.equal(verifySession(token,'designs',secret,now), true);
 for (const value of ['', 'granted', token + 'x', token.replace('designs','martyig')]) assert.equal(verifySession(value,'designs',secret,now),false);
 assert.equal(verifySession(token,'martyig',secret,now),false);
 assert.equal(verifySession(token,'designs',secret,now + SESSION_SECONDS*1000),false);
 assert.equal(verifySession(token,'designs','wrong-key',now),false);
});
test('large file manifest retains supported upload size but rejects unbounded requests', () => {
 const base = { kind: 'cutline', fields: {}, files: [{field:'file',name:'art.png',type:'image/png',size:30*1024*1024}] };
 assert.ok(manifestSchema.safeParse(base).success);
 assert.equal(manifestSchema.safeParse({...base,files:[{...base.files[0],size:31*1024*1024}]}).success,false);
 assert.equal(manifestSchema.safeParse({...base,files:[{...base.files[0],field:'../../other-object'}]}).success,false);
 assert.equal(manifestSchema.safeParse({...base,fields:{url:'http://169.254.169.254'}}).success,false);
 assert.equal(manifestSchema.safeParse({...base,files:[...base.files,...base.files]}).success,false);
});
