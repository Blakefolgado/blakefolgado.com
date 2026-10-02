import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import handler, { changeState, exchange, validate, dream } from '../server/tide.js';
import { privateExchange } from '../src/tide.js';

test('real visitors expire, notes persist and retries do not duplicate a saved bottle', () => {
  const state = {}, id = randomUUID(), other = randomUUID(), now = Date.now();
  const visit = { action: 'sync', id, x: .2, y: .8 };
  assert.deepEqual(exchange(state, visit, 'ip-a', now).people, []);
  const second = exchange(state, { ...visit, id: other }, 'ip-b', now + 1000);
  assert.equal(second.people[0].id, id);
  assert.equal(second.people[0].x, .2);
  const note = validate({ action: 'note', id, noteId: randomUUID(), text: '  Keep these words exactly. 🌊\nHello!  ' });
  assert.equal(exchange(state, note, 'ip-a', now + 2000).saved, note.noteId);
  assert.equal(exchange(state, note, 'ip-a', now + 2100).saved, note.noteId);
  assert.equal(state.notes.length, 1);
  const later = exchange(state, { ...visit, id: other }, 'ip-b', now + 22000);
  assert.deepEqual(later.people, []);
  assert.equal(later.notes[0].text, note.text);
  assert.ok(!('author' in later.notes[0]), 'public notes do not leak internal identity');
  assert.equal(exchange(state, visit, 'ip-a', now + 86400000).notes.length, 1);
});

test('anonymous traffic and model generation have shared caps, not client-controlled limits', () => {
  const now = Date.now(), state = {}, id = randomUUID();
  const visit = { action: 'sync', id, x: .5, y: .5 };
  exchange(state, visit, 'same-ip', now);
  assert.throws(() => exchange(state, { ...visit, id: randomUUID() }, 'same-ip', now + 100), /moment/);
  for (let i = 1; i <= 3; i++) exchange(state, { action: 'note', id, noteId: randomUUID(), text: 'Hello' }, 'same-ip', now + i * 1000);
  assert.throws(() => exchange(state, { action: 'note', id, noteId: randomUUID(), text: 'Hello' }, 'same-ip', now + 4000), /Three bottles/);
  assert.equal(exchange(state, { action: 'dream', id }, 'b', now + 5000).generate, true);
  assert.equal(exchange(state, { action: 'dream', id }, 'c', now + 6000).generate, false);
  state.calls = 3000;
  assert.throws(() => exchange(state, visit, 'd', now + 10000), /tomorrow/);
  assert.throws(() => validate({ ...visit, x: NaN }), /position/);
  assert.throws(() => validate({ action: 'note', id, noteId: randomUUID(), text: 'x'.repeat(181) }), /180/);
});

test('concurrent local saves survive a disk reload without lost updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pixel-tide-'));
  process.env.GARDEN_LOCAL_FILE = join(dir, 'state.json');
  try {
    await Promise.all(Array.from({ length: 12 }, (_, i) => changeState(state => {
      state.notes ??= []; state.notes.push({ id: i, text: `note ${i}` });
    })));
    const saved = JSON.parse(await readFile(process.env.GARDEN_LOCAL_FILE, 'utf8'));
    assert.equal(saved.notes.length, 12);
    assert.equal(await changeState(state => state.notes.length), 12);
  } finally { delete process.env.GARDEN_LOCAL_FILE; await rm(dir, { recursive: true }); }
});

test('dream generation is free-only and never retries with a paid model', async () => {
  const originalFetch = global.fetch, originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'openrouter/free');
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
    assert.ok(!body.models && !body.plugins);
    return new Response('', { status: 429 });
  };
  try { await assert.rejects(dream(), /No new daydreams/); assert.equal(calls, 1); }
  finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey; }
});

test('unconfigured production explicitly uses private bottles without storage or AI calls', async () => {
  const names=['VERCEL','KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'];
  const saved=names.map(name=>process.env[name]),originalFetch=global.fetch;
  names.forEach(name=>delete process.env[name]);process.env.VERCEL='1';
  global.fetch=async()=>{throw new Error('An unconfigured shore must not call a provider');};
  try {
    for(const action of ['sync','note','dream']){
      const req={method:'POST',headers:{origin:'https://example.test',host:'example.test','content-type':'application/json'},body:{id:randomUUID(),action,x:.2,y:.8,noteId:randomUUID(),text:'Hello'}};
      let result;const res={setHeader(){},end(body){result=JSON.parse(body);}};
      await handler(req,res);
      assert.equal(res.statusCode,200);assert.deepEqual(result,{localOnly:true});
      assert.ok(!result.saved,'the server cannot claim a browser save happened');
    }
  } finally {
    global.fetch=originalFetch;names.forEach((name,i)=>{if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i];});
  }
});

test('private bottles persist exact wording, deduplicate retries, and fail loudly on a blocked browser save', () => {
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const input={action:'note',noteId:randomUUID(),text:'  My own little sea. 🌊\nHello!  '};
  assert.equal(privateExchange(storage,input).saved,input.noteId);
  privateExchange(storage,input);
  const loaded=privateExchange(storage,{action:'sync'});
  assert.deepEqual(loaded.people,[]);assert.equal(loaded.notes.length,1);assert.equal(loaded.notes[0].text,input.text);
  assert.equal(privateExchange(storage,{action:'dream'}).dream,null,'private mode invents neither visitors nor AI messages');
  assert.throws(()=>privateExchange({...storage,setItem(){throw new Error('Quota exceeded');}},input),/could not save/);
  assert.throws(()=>privateExchange({...storage,getItem(){return '{broken';}},input),/could not be read/);
});
