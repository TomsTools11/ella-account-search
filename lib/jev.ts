import { TypeSafeClient, type EntryType, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

// TypeSafe's Jev model: fast (~100 ms) typed judgments with calibrated probabilities.
// Used for search matching only (lib/resolve.ts). Every failure returns null so the caller
// falls back to the Claude path.

/** Pinned so tuned thresholds don't drift when TypeSafe moves `jev-latest`. */
export const JEV_MODEL = process.env.JEV_MODEL || "jev-1.13.0";

/** Search matching runs through Jev only when switched on and a key is present. */
export const jevSearchOn = () => process.env.JEV_SEARCH === "1" && !!process.env.TYPESAFE_API_KEY;

let client: TypeSafeClient | null = null;

export async function askJev<Q extends Questions>(
  label: string,
  state: NonNullable<EntryType>,
  questions: Q,
  signal?: AbortSignal,
): Promise<SystemOneResult<Q> | null> {
  if (!process.env.TYPESAFE_API_KEY) return null;
  const started = Date.now();
  try {
    client ??= new TypeSafeClient({ defaultModel: JEV_MODEL, timeout: 3000, retry: { maxRetries: 1 }, logLevel: "off" });
    const r = await client.systemOne({ state, questions }, { signal });
    console.log(`[jev] ${label}: ${r.model}, ${Date.now() - started}ms, ${r.usage.input_tokens ?? "?"} input tokens`);
    return r;
  } catch (e) {
    if (!signal?.aborted) console.warn(`[jev] ${label} failed after ${Date.now() - started}ms: ${(e as Error).message}`);
    return null;
  }
}
