import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider } from './AiProvider.js';
import { DEFAULT_ANTHROPIC_MODEL, type AnthropicProviderConfig } from '../../config/schema.js';

/**
 * Claude API (Anthropic, direct) implementation of AiProvider.
 *
 * Auth: API key read from the env var named in config.apiKeyEnv
 * (e.g. ANTHROPIC_API_KEY) — same `*Env` pattern as wiki.pat / WIKI_PAT,
 * so the secret never lives in doc-gen.config.yml.
 */
export class AnthropicProvider implements AiProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: AnthropicProviderConfig) {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `Anthropic provider: environment variable '${config.apiKeyEnv}' is not set. ` +
        `Inject it via your ADO pipeline secret variables (same pattern as WIKI_PAT).`
      );
    }
    this.client = new Anthropic({ apiKey });
    // `?? DEFAULT_ANTHROPIC_MODEL` only catches null/undefined, so `model: ''`
    // in doc-gen.config.yml (loader.ts treats model as optional and never
    // rejects an empty string) used to be forwarded to the SDK verbatim,
    // failing the whole enrichment run on the first summarisation.
    this.model = config.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
  }

  async summarise(prompt: string, maxTokens: number = 1024): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    // Flagged, not fixed by retrying — a truncated summary is still useful
    // content, but shipping it to a client's wiki/.docx with no indication it
    // was cut off mid-sentence is worse than a visible warning in the run log.
    if (response.stop_reason === 'max_tokens') {
      console.warn(
        '  ⚠ Anthropic provider: response was truncated by the max_tokens limit — the summary may be cut off mid-sentence.'
      );
    }

    // Anthropic can return more than one text block (e.g. extended thinking
    // interleaved with prose) — join all of them rather than taking only the
    // first, which used to silently drop the tail of a split response.
    const textBlocks = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text');
    if (textBlocks.length === 0) {
      throw new Error('Anthropic provider: response contained no text content block');
    }

    const text = textBlocks.map(b => b.text).join('').trim();
    if (!text) {
      // A blank string used to be returned as a "successful" summary here,
      // which aiSummariser.ts then cached against the component's content
      // hash — a permanently blank AI summary heading that survives every
      // re-run until the component's own XML changes. Throwing routes this
      // through aiSummariser's existing skip-and-continue handling instead,
      // the same as any other provider failure.
      throw new Error('Anthropic provider: text content block was empty or whitespace-only');
    }
    return text;
  }
}
