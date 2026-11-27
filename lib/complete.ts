/**
 * Non-streaming completion, used by the Website Builder.
 *
 * The chat path streams tokens because a person is waiting to read them. The
 * website builder cannot use a half-finished page, so it wants the whole
 * document in one piece. Rather than write a second set of provider adapters,
 * this reuses `streamCompletion` and concatenates the result — that way every
 * provider keeps working here automatically, including any added later.
 *
 * Two guards keep a runaway generation from burning quota:
 *  - a character budget, enforced as tokens arrive;
 *  - a deadline, enforced with a real AbortSignal so a provider that stalls
 *    mid-stream is actually disconnected rather than merely ignored.
 */
import { streamCompletion, type StreamRequest } from "./providers";
import { PROVIDERS, providerKey, type ProviderId } from "./config";

export type CompleteRequest = {
  provider: ProviderId;
  model: string;
  system: string;
  messages: StreamRequest["messages"];
  temperature: number;
  maxTokens: number;
  /** Abandon the generation once this many characters have arrived. */
  maxChars?: number;
  /** Abandon the generation this many milliseconds after it starts. */
  timeoutMs?: number;
};

export type CompleteResult = { text: string; truncated: boolean };

export class CompleteTimeoutError extends Error {
  constructor() {
    super("The model took too long to finish. Try a shorter or simpler brief.");
    this.name = "CompleteTimeoutError";
  }
}

export async function completeText(request: CompleteRequest): Promise<CompleteResult> {
  const { maxChars = 200_000, timeoutMs = 120_000, ...rest } = request;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const iterator = streamCompletion({ ...rest, signal: controller.signal })[Symbol.asyncIterator]();
  let text = "";

  try {
    while (true) {
      const step = await iterator.next();
      if (step.done) break;
      if (step.value.type === "text") text += step.value.text;
      if (text.length > maxChars) return { text, truncated: true };
    }
  } catch (cause) {
    // An abort surfaces as an AbortError from fetch, or as a generic failure
    // once the body reader is torn down. Both mean the same thing to a caller.
    if (controller.signal.aborted) throw new CompleteTimeoutError();
    throw cause;
  } finally {
    clearTimeout(timer);
    // Release the provider's reader. With the signal already aborted this
    // returns promptly instead of waiting on a stalled socket.
    try {
      await iterator.return?.(undefined);
    } catch {
      // Already finished or errored; nothing to release.
    }
  }

  return { text, truncated: false };
}

/**
 * The provider a studio should use, and what to tell the user when there is
 * none. Studios require a real model: unlike chat they cannot fall back to
 * demo, because a placeholder page is not a usable deliverable.
 */
export function studioProvider(): {
  provider: ProviderId;
  model: string;
  available: ProviderId[];
  missing: string[];
} {
  const available = (Object.keys(PROVIDERS) as ProviderId[]).filter(
    (id) => id !== "demo" && providerKey(id),
  );

  const preferred = process.env.AI_PROVIDER?.trim() as ProviderId | undefined;
  const provider =
    preferred && available.includes(preferred) ? preferred : available[0] ?? "demo";

  // Studios can use a different model from chat — a page needs more output and
  // benefits from a stronger model than a short chat reply.
  const override = process.env.WEBSITE_MODEL?.trim();

  return {
    provider,
    model: override || PROVIDERS[provider].defaultModel,
    available,
    missing: (Object.keys(PROVIDERS) as ProviderId[])
      .filter((id) => id !== "demo")
      .map((id) => PROVIDERS[id].envKey),
  };
}
