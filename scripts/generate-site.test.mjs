// Run: node scripts/generate-site.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertScriptsParse, generatePage } from "./generate-site.mjs";

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
const args = { apiKey: "test-key", content, dateSeed: "2026-09-26", numericSeed: 42 };
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
