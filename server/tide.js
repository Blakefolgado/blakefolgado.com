import { createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';

const KEY = 'pixel-garden:v1';
const CAS = `if (redis.call('GET',KEYS[1]) or '') ~= ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2]); return 1`;
let localQueue = Promise.resolve();

export class TideError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new TideError(503, 'The shared shore is not connected yet.');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new TideError(503, 'The shared shore is resting. Try again later.');
  const data = await response.json();
  if (data.error) throw new TideError(503, 'The shared shore is resting. Try again later.');
  return data.result;
}

// ponytail: one bounded garden, not a game service. CAS preserves concurrent notes
// across Vercel instances; split into rooms if more than 24 people need to share it.
export async function changeState(change) {
  if (!process.env.VERCEL && process.env.GARDEN_LOCAL_FILE) {
    const task = localQueue.then(async () => {
      let raw;
      try { raw = await readFile(process.env.GARDEN_LOCAL_FILE, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const state = raw ? JSON.parse(raw) : {};
      const result = change(state);
      await writeFile(`${process.env.GARDEN_LOCAL_FILE}.tmp`, JSON.stringify(state), { mode: 0o600 });
      await rename(`${process.env.GARDEN_LOCAL_FILE}.tmp`, process.env.GARDEN_LOCAL_FILE);
      return result;
    });
    localQueue = task.catch(() => {}); // Keep the queue usable; callers still receive the rejection.
    return task;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await redis(['GET', KEY]);
    const state = raw ? JSON.parse(raw) : {};
    const result = change(state);
    if (await redis(['EVAL', CAS, 1, KEY, raw || '', JSON.stringify(state)])) return result;
  }
  throw new TideError(503, 'The shore is busy. Try again in a moment.');
}

export function validate(input) {
  if (!input || !/^[a-f0-9-]{36}$/.test(input.id) || !['sync', 'note', 'dream'].includes(input.action)) throw new TideError(400, 'Invalid visit. Refresh the page.');
  const data = { id: input.id, action: input.action };
  if (input.action === 'sync') {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) throw new TideError(400, 'Invalid position.');
    data.x = input.x; data.y = input.y;
  }
  if (input.action === 'note') {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 180 || /[\u0000-\u0008\u000b-\u001f]/.test(input.text)) throw new TideError(400, 'A note needs 1–180 characters.');
    if (!/^[a-f0-9-]{36}$/.test(input.noteId)) throw new TideError(400, 'Invalid bottle.');
    data.text = input.text; data.noteId = input.noteId;
  }
  return data;
}

export function exchange(state, input, ip, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.calls = 0; state.clients = {}; state.dreamCalls = 0; }
  state.notes ??= []; state.dreams ??= []; state.people ??= {};
  const client = state.clients[ip] ?? { last: 0, notes: 0 };
  // A retry after an uncertain save returns the existing receipt, never a duplicate.
  const saved = input.action === 'note' && state.notes.find(note => note.id === input.noteId && note.author === input.id);
  if (saved) return { saved: saved.id };
  if (state.calls >= 3000) throw new TideError(429, 'The shared shore is resting until tomorrow.');
  if (now - client.last < 900) throw new TideError(429, 'Give the tide a moment.');
  state.calls++; client.last = now; state.clients[ip] = client;
  for (const [id, person] of Object.entries(state.people)) if (now - person.at > 20000) delete state.people[id];
  if (input.action === 'sync') {
    if (state.people[input.id] || Object.keys(state.people).length < 24) state.people[input.id] = { id: input.id, x: input.x, y: input.y, at: now };
    return {
      people: Object.values(state.people).filter(p => p.id !== input.id),
      notes: state.notes.slice(-40).map(({ id, text, at }) => ({ id, text, at })),
      dreams: state.dreams,
    };
  }
  if (input.action === 'note') {
    if (client.notes >= 3) throw new TideError(429, 'Three bottles is plenty for today. Come back tomorrow.');
    client.notes++;
    state.notes.push({ id: input.noteId, author: input.id, text: input.text, at: now });
    state.notes = state.notes.slice(-256);
    return { saved: input.noteId };
  }
  const cached = state.dreams.length ? state.dreams[Math.floor(Math.random() * state.dreams.length)] : null;
  if (state.dreamCalls >= 20 || now - (state.lastDream || 0) < 3600000) return { dream: cached, generate: false };
  state.dreamCalls++; state.lastDream = now;
  return { dream: cached, generate: true };
}

export async function dream() {
  if (!process.env.OPENROUTER_API_KEY) throw new TideError(503, 'No new daydreams just now. Try another bottle.');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(18000),
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openrouter/free', max_tokens: 512, temperature: 1,
      reasoning: { enabled: false, exclude: true },
      provider: { max_price: { prompt: 0, completion: 0 } },
      messages: [{ role: 'user', content: `Write one playful, oddly specific little discovery washed ashore in a pixel world. Under 150 characters. A surprising object or tiny imaginary scene, warm and quietly funny. Plain text only. No greeting, advice, claims about real people, links or quotation marks. Variation seed: ${randomUUID()}.` }],
    }),
  });
  if (!response.ok) { console.warn('Free model HTTP status:', response.status); throw new TideError(503, 'No new daydreams just now. Try another bottle.'); }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text || text.length > 180 || /https?:\/\/|<[^>]+>/.test(text)) { console.warn('Free model response rejected:', data.choices?.[0]?.finish_reason, text?.length || 0); throw new TideError(503, 'No new daydreams just now. Try another bottle.'); }
  return { id: randomUUID(), text, at: Date.now() };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new TideError(405, 'Use POST.'); }
    const origin = req.headers.origin;
    if (!origin || new URL(origin).host !== req.headers.host) throw new TideError(403, 'Visit the garden to leave a note.');
    if (!req.headers['content-type']?.startsWith('application/json')) throw new TideError(415, 'Use JSON.');
    if (Number(req.headers['content-length']) > 2048) throw new TideError(413, 'That bottle is too full.');
    let body = req.body;
    if (body === undefined) {
      let raw = '';
      for await (const part of req) { raw += part; if (Buffer.byteLength(raw) > 2048) throw new TideError(413, 'That bottle is too full.'); }
      try { body = JSON.parse(raw); } catch { throw new TideError(400, 'Invalid bottle.'); }
    } else if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { throw new TideError(400, 'Invalid bottle.'); }
    }
    if (Buffer.byteLength(JSON.stringify(body) || '') > 2048) throw new TideError(413, 'That bottle is too full.');
    const input = validate(body);
    const address = process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.socket.remoteAddress;
    if (!address) throw new TideError(503, 'The shore is unavailable.');
    // Salted, rotating daily hash for limits; never persist or return raw IP addresses.
    const salt = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || 'local-development';
    const ip = createHmac('sha256', salt).update(`${new Date().toISOString().slice(0, 10)}:${address}`).digest('hex').slice(0, 24);
    const result = await changeState(state => exchange(state, input, ip));
    if (result.generate) {
      try {
        const message = await dream();
        await changeState(state => { state.dreams = [...(state.dreams || []), message].slice(-24); });
        result.dream = message;
      } catch (error) {
        console.warn('Free daydream unavailable:', error instanceof TideError ? error.message : error.name);
        if (!result.dream) throw new TideError(503, 'No new daydreams just now. Try another bottle.');
      }
    }
    delete result.generate;
    res.statusCode = 200; res.end(JSON.stringify(result));
  } catch (error) {
    if (!(error instanceof TideError)) console.error('Tide request failed:', error.name);
    res.statusCode = error instanceof TideError ? error.status : 503;
    if (res.statusCode === 429) res.setHeader('Retry-After', '60');
    res.end(JSON.stringify({ error: error instanceof TideError ? error.message : 'The shore is unavailable. Your note has not been confirmed saved.' }));
  }
}
