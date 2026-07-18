/**
 * Common interface every AI provider implementation must satisfy.
 *
 * Keeping this interface tiny (one method) is deliberate — it's the seam
 * that lets aiSummariser.ts stay completely provider-agnostic. New providers
 * are a new file + one factory case; nothing else in the enrichment pipeline
 * needs to change.
 */
export interface AiProvider {
  /**
   * Sends a fully-built prompt to the underlying AI service and returns
   * the raw text response. Implementations should throw on failure —
   * the orchestrator (aiSummariser.ts) is responsible for catching,
   * logging, and applying the skip-and-continue strategy.
   *
   * `maxTokens` lets a caller request a larger completion budget for a
   * single call (e.g. a retry after a truncated structured-output
   * response) without raising the cost of every other call. Implementations
   * default to 1024 when omitted.
   */
  summarise(prompt: string, maxTokens?: number): Promise<string>;
}
