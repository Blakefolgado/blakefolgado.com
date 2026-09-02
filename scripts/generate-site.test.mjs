// Run: node scripts/generate-site.test.mjs
import assert from "node:assert/strict";
import { assertScriptsParse } from "./generate-site.mjs";

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

console.log("ok — assertScriptsParse catches the failures that shipped");
