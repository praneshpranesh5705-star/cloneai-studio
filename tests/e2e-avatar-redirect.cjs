/**
 * Preloaded into the built server by tests/e2e-avatar.mjs.
 *
 * Swaps the vendor hostnames for the local mock so the real adapters run
 * unchanged \u2014 same paths, same bodies, same headers \u2014 against a fake model.
 * Nothing else about fetch is altered.
 */
const MOCK = "http://127.0.0.1:3112";

const HOSTS = [
  "https://generativelanguage.googleapis.com",
  "https://api.openai.com",
];

const realFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(input, init) {
  const target = typeof input === "string" ? input : input?.url ?? String(input);
  for (const host of HOSTS) {
    if (target.startsWith(host)) {
      return realFetch(target.replace(host, MOCK), init);
    }
  }
  return realFetch(input, init);
};
