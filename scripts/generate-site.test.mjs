// Run: node scripts/generate-site.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertScriptsParse, generatePage, callOpenRouter } from "./generate-site.mjs";

const throws = (html, why) => assert.throws(() => assertScriptsParse(html), undefined, why);

// The 2026-09-02 live failure: a "//" comment lost its trailing newline, so the call
// that started the piece was commented out. Valid HTML, valid JS, dead page.
throws(
  "<script>(function(){function build(){}// initial statebuild();})();</script>",
  "must reject a script whose tail is swallowed by a // comment"
);

// Truncated output — the model hit the token ceiling mid-function.
throws("<script>(function(){var a=1;if(a){</script>", "must reject unparseable JS");

// The 2026-09-02 second failure: the model stopped mid-string, so the tag never
// closed. An unclosed block matches no regex, so it has to be caught by counting.
throws(
  "<style>body{color:red}</style><script>(function(){var t='oh no",
  "must reject a <script> that is never closed"
);
throws("<style>body{color:red}", "must reject a <style> that is never closed");

// Healthy piece: real newline after the comment, balanced everything.
assertScriptsParse("<script>(function(){function build(){}\n// initial state\nbuild();})();</script>");

// Non-JS scripts and external ones are left alone.
assertScriptsParse('<script type="application/json">{"a":1}</script>');
assertScriptsParse('<script src="/_vercel/insights/script.js"></script>');
assertScriptsParse("<style>body{color:red}</style>");

// Compile as a browser script, without executing generated code.
throws("<script>return;</script>", "top-level return cannot run in a browser script");
assertScriptsParse('<script>throw new Error("must never execute");</script>');
assertScriptsParse('<script>(function(){var link="https://blakefolgado.com";window.open(link);})();</script>');
assertScriptsParse('<script>(function(){}()); // Finished (intentionally)</script>');

// Reproduce the reported "Unexpected token 'var'" with a missing separator.
// Repair needs the rejected response and the parser location, not another blind
// generation with the same seed. Never publish it if all repairs fail.
const content = JSON.parse(await readFile(new URL("../content/site-content.json", import.meta.url), "utf8"));
const invalid = { body_html: `<main>${" ".repeat(2800)}</main><script>(function(){\nvar a=1 var b=2;\n})();</script>` };
const valid = { body_html: invalid.body_html.replace("var a=1 var", "var a=1; var") };
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const requests = [];
const warnings = [];
let responses = [invalid, valid];
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  return Response.json({ choices: [{ message: { content: JSON.stringify(responses.shift()) } }] });
};
console.warn = (message) => warnings.push(message);
const args = { apiKey: "test-key", content, dateSeed: "2026-09-26", numericSeed: 42, audit: { runId: 'test-run', writeReceipt: async () => {} } };
try {
  const design = await generatePage(args);
  assert.equal(design.bodyHtml, valid.body_html);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((r) => r.seed), [42, 43]);
  assert.equal(requests[1].temperature, 0.2);
  assert.deepEqual(requests[1].response_format, { type: "json_object" });
  assert.deepEqual(JSON.parse(requests[1].messages.at(-2).content), invalid);
  assert.match(requests[1].messages.at(-1).content, /Unexpected token 'var'/);
  assert.match(requests[1].messages.at(-1).content, /inline-script-1\.js:2/);
  assert.match(warnings[0], /attempt 1\/3 failed/);

  requests.length = 0;
  responses = [invalid, invalid, invalid];
  await assert.rejects(generatePage(args), /Unexpected token 'var'/);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map((r) => r.seed), [42, 43, 44]);
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

console.log("ok — invalid scripts receive repair context and cannot be published");

// Provider failures and charged parse failures must remain joinable without storing text.
const receipts = [];
const audit = { runId: 'audit-run', dateSeed: '2026-10-01', writeReceipt: async receipt => { receipts.push(receipt); } };
const requestBody = { model: 'test/model', messages: [{ role: 'user', content: 'private prompt' }] };
const originalError = console.error;
try {
  let request;
  globalThis.fetch = async (_url, options) => {
    request = options;
    return Response.json({ id: 'gen-success', choices: [{ message: { content: '{"ok":true}' } }],
      usage: { cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.02 } } });
  };
  assert.deepEqual(await callOpenRouter('test-key', requestBody, audit), { ok: true });
  assert.equal(request.headers['x-title'], 'blakefolgado.com'); assert.equal(request.headers['x-session-id'], 'audit-run');
  assert.equal(receipts[0].generation_id, 'gen-success'); assert.equal(receipts[0].billed_cost, 0);
  assert.equal(receipts[0].byok_upstream_cost, 0.02); assert.equal(JSON.stringify(receipts).includes('private prompt'), false);
  assert.deepEqual(JSON.parse(request.body), requestBody);

  globalThis.fetch = async () => Response.json({ id: 'gen-error', error: { message: 'failed' }, usage: { cost: 0.01 } }, { status: 503 });
  await assert.rejects(callOpenRouter('test-key', requestBody, audit), /OpenRouter 503:/);
  assert.equal(receipts[1].status, 'failed'); assert.equal(receipts[1].generation_id, 'gen-error'); assert.equal(receipts[1].billed_cost, 0.01);

  globalThis.fetch = async () => Response.json({ id: 'gen-invalid', choices: [{ message: { content: 'not JSON' } }],
    usage: { cost: 0.03, is_byok: false, cost_details: { upstream_inference_cost: 0.02 } } });
  await assert.rejects(callOpenRouter('test-key', requestBody, audit), /No JSON/);
  assert.equal(receipts[2].status, 'failed'); assert.equal(receipts[2].billed_cost, 0.03); assert.equal(receipts[2].byok_upstream_cost, null);

  globalThis.fetch = async () => { throw new Error('network failed'); };
  await assert.rejects(callOpenRouter('test-key', requestBody, audit), /network failed/);
  assert.equal(receipts[3].status, 'unknown'); assert.equal(receipts[3].billed_cost, null);

  let calls = 0; let storageErrors = 0;
  console.error = () => { storageErrors++; };
  globalThis.fetch = async () => { calls++; return Response.json({ id: 'gen-paid', choices: [{ message: { content: '{"ok":true}' } }] }); };
  assert.deepEqual(await callOpenRouter('test-key', requestBody, { writeReceipt: async () => { throw new Error('disk failed'); } }), { ok: true });
  assert.equal(calls, 1); assert.equal(storageErrors, 1);
} finally { globalThis.fetch = originalFetch; console.error = originalError; }
console.log('ok — provider receipts retain charged failures, distinguish BYOK and cannot cause paid retries');
