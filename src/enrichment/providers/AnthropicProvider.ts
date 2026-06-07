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
    this.model = config.model ?? DEFAULT_ANTHROPIC_MODEL;
  }

  async summarise(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textBlock) {
      throw new Error('Anthropic provider: response contained no text content block');
    }
    return textBlock.text.trim();
  }
}
