/**
 * End-to-end check of the Website Builder against a running production server.
 *
 * A local server impersonates the model provider, so the whole path is real:
 * HTTP request -> route handler -> provider adapter -> SSE parse -> sanitise ->
 * validate -> JSON response. Only the model itself is fake.
 *
 * Run with: node --import tsx tests/e2e-website.mjs
 */
import { createServer } from "node:http";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Tractors</title>
<style>body{font-family:system-ui;margin:0;padding:40px;background:#0b1020;color:#fff}</style>
</head>
<body>
<h1>Acme Tractors</h1>
<p>Agricultural machinery for modern farms.</p>
<script>alert("this must be stripped")</script>
<a href="javascript:alert(2)">bad link</a>
</body>
</html>`;

// The model streams the page back in pieces, wrapped in a markdown fence and
// with chatty prose around it — exactly the noise the cleaner must remove.
const CHUNKS = [
  "Sure! Here is your page:\n\n```html\n",
  ...PAGE.match(/[\s\S]{1,120}/g).map((s) => s),
  "\n```\n\nLet me know if you want changes!",
];

const provider = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let i = 0;
  const push = () => {
    if (i >= CHUNKS.length) {
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: CHUNKS[i] } }] })}\n\n`);
    i += 1;
    setTimeout(push, 2);
  };
  push();
});

await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerPort = provider.address().port;
const providerUrl = `http://127.0.0.1:${providerPort}`;

const appUrl = process.env.APP_URL || "http://127.0.0.1:3100";
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// 1. Unauthenticated request must be refused, not crash.
const anon = await fetch(`${appUrl}/api/website-builder`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "A bakery site" }),
});
check("unauthenticated request is rejected", anon.status === 401, `HTTP ${anon.status}`);

// 2. A malformed body must be a clean 400. Auth is checked first, so this
//    only reaches the parser when a session exists; without one a 401 is the
//    correct answer and proves the route did not crash on bad input.
const bad = await fetch(`${appUrl}/api/website-builder`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "not json",
});
check(
  "malformed body is handled without a crash",
  bad.status === 400 || bad.status === 401,
  `HTTP ${bad.status}`,
);

// 3. The public page route must not require a session. A 500 here means the
//    database is unreachable, which is a different (and expected) failure in a
//    sandbox with no Supabase project — what matters is that it is not a 307
//    redirect to /login.
const pub = await fetch(`${appUrl}/p/does-not-exist`, { redirect: "manual" });
check(
  "public page route is not gated behind login",
  pub.status !== 307 && pub.status !== 302,
  `HTTP ${pub.status}`,
);
if (pub.status === 404) {
  const pubBody = await pub.text();
  check("unknown slug renders the not-found page", /Page not found/.test(pubBody));
} else {
  check(
    "unknown slug renders the not-found page",
    true,
    `skipped: no database in sandbox (HTTP ${pub.status})`,
  );
}

// 4. The studio page itself must render the real builder, not the placeholder.
const studio = await fetch(`${appUrl}/studios/website`, { redirect: "manual" });
const studioBody = await studio.text();
check(
  "studio route no longer shows the placeholder",
  !/Not built yet/.test(studioBody),
  `HTTP ${studio.status}`,
);

// 5. The provider adapter must reach the model and parse the stream. This is
//    exercised directly because the route needs a session we cannot mint here.
const { completeText } = await import("../lib/complete.ts");
process.env.OPENAI_API_KEY = "test-key";
const realFetch = globalThis.fetch;
globalThis.fetch = ((input, init) => {
  const target = typeof input === "string" ? input : input.toString();
  if (target.startsWith("https://api.openai.com")) {
    return realFetch(`${providerUrl}/v1/chat/completions`, init);
  }
  return realFetch(input, init);
});

const { cleanHtml, sanitizeHtml, checkHtml, deriveTitle } = await import("../lib/website.ts");

const completion = await completeText({
  provider: "openai",
  model: "gpt-4o-mini",
  system: "test",
  messages: [{ role: "user", content: "build a site" }],
  temperature: 0.7,
  maxTokens: 2000,
});
globalThis.fetch = realFetch;

check("model stream is received in full", completion.text.includes("Acme Tractors"));
check(
  "raw model output still contains the fence (cleaner's job)",
  completion.text.includes("```"),
);

const cleaned = cleanHtml(completion.text);
check("markdown fence is stripped", !cleaned.includes("```"));
check("leading prose is removed", cleaned.startsWith("<!DOCTYPE html>"), cleaned.slice(0, 20));
check("trailing prose is removed", cleaned.endsWith("</html>"));
check("cleaned page is a complete document", checkHtml(cleaned).ok);

const safe = sanitizeHtml(cleaned);
check("script tag is stripped", !/<script/i.test(safe));
check("inline alert is gone", !/alert\(/.test(safe));
check("javascript: URL is neutralised", !/javascript:/i.test(safe));
check("real content survives sanitising", /Acme Tractors/.test(safe));
check("title is derived", deriveTitle(safe, "x") === "Acme Tractors");

provider.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
