import type { AiEnrichmentConfig } from '../../config/schema.js';
import type { AiProvider } from './AiProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { AzureOpenAIProvider } from './AzureOpenAIProvider.js';

export type { AiProvider } from './AiProvider.js';
export { AnthropicProvider } from './AnthropicProvider.js';
export { AzureOpenAIProvider } from './AzureOpenAIProvider.js';

/**
 * Builds the configured AI provider.
 *
 * This factory is the only place that knows about concrete provider classes —
 * aiSummariser.ts depends solely on the AiProvider interface. Adding a new
 * provider means: new file implementing AiProvider, export it here, add a case.
 *
 * Throws if the config is missing required fields for the selected provider —
 * mirrors the fail-fast validation already performed at config-load time
 * (validateAiEnrichmentConfig in config/loader.ts), so this should only ever
 * trigger if the factory is called directly with a hand-built config.
 */
export function createProvider(config: AiEnrichmentConfig): AiProvider {
  switch (config.provider) {
    case 'anthropic':
      if (!config.anthropic) {
        throw new Error(`createProvider: provider is 'anthropic' but config.anthropic is missing`);
      }
      return new AnthropicProvider(config.anthropic);

    case 'azure-openai':
      if (!config.azureOpenAI) {
        throw new Error(`createProvider: provider is 'azure-openai' but config.azureOpenAI is missing`);
      }
      return new AzureOpenAIProvider(config.azureOpenAI);

    default:
      throw new Error(`createProvider: unknown provider '${(config as any).provider}'`);
  }
}
