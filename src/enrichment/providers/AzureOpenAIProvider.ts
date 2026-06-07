import { AzureOpenAI } from 'openai';
import type { AiProvider } from './AiProvider.js';
import type { AzureOpenAIProviderConfig } from '../../config/schema.js';

/**
 * Azure OpenAI Service implementation of AiProvider.
 *
 * Supports two auth modes (mirrors the decision documented in architecture.jsx):
 *  - API key: read from the env var named in config.apiKeyEnv
 *  - Managed identity: when config.useManagedIdentity is true, an Azure AD
 *    bearer token provider is used instead — zero secrets to rotate. This is
 *    the preferred enterprise path for clients already deep in Azure.
 *
 * The endpoint URL is read from the env var named in config.endpointEnv —
 * never committed to doc-gen.config.yml (same `*Env` pattern as wiki.pat).
 */
export class AzureOpenAIProvider implements AiProvider {
  private client: AzureOpenAI;
  private deployment: string;

  constructor(config: AzureOpenAIProviderConfig) {
    const endpoint = process.env[config.endpointEnv];
    if (!endpoint) {
      throw new Error(
        `Azure OpenAI provider: environment variable '${config.endpointEnv}' is not set. ` +
        `It should hold the Azure OpenAI resource endpoint URL.`
      );
    }

    this.deployment = config.deployment;

    if (config.useManagedIdentity) {
      // Managed identity auth — requires @azure/identity at runtime in the
      // hosting environment (ADO Microsoft-hosted agents support this via
      // workload identity federation / service connections).
      this.client = new AzureOpenAI({
        endpoint,
        deployment: config.deployment,
        apiVersion: config.apiVersion,
        apiKey: undefined,
        // The 'openai' Azure client accepts an azureADTokenProvider; resolved
        // lazily so environments without managed identity configured don't
        // fail at import time — only when actually used without a key.
        azureADTokenProvider: createManagedIdentityTokenProvider(),
      } as any);
    } else {
      if (!config.apiKeyEnv) {
        throw new Error(
          `Azure OpenAI provider: useManagedIdentity is false but apiKeyEnv was not provided.`
        );
      }
      const apiKey = process.env[config.apiKeyEnv];
      if (!apiKey) {
        throw new Error(
          `Azure OpenAI provider: environment variable '${config.apiKeyEnv}' is not set. ` +
          `Inject it via your ADO pipeline secret variables (same pattern as WIKI_PAT).`
        );
      }
      this.client = new AzureOpenAI({
        endpoint,
        apiKey,
        deployment: config.deployment,
        apiVersion: config.apiVersion,
      });
    }
  }

  async summarise(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.deployment,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('Azure OpenAI provider: response contained no message content');
    }
    return text.trim();
  }
}

/**
 * Lazily builds an Azure AD token provider for managed identity auth.
 * Deferred require so that clients who don't use managed identity never
 * need @azure/identity installed or configured.
 */
function createManagedIdentityTokenProvider(): () => Promise<string> {
  return async () => {
    let getBearerTokenProvider: any;
    let DefaultAzureCredential: any;
    try {
      // @ts-ignore — optional peer dependency, only required for managed identity auth
      ({ DefaultAzureCredential } = await import('@azure/identity'));
      // @ts-ignore
      ({ getBearerTokenProvider } = await import('openai/azure'));
    } catch {
      throw new Error(
        `Azure OpenAI managed identity auth requires the '@azure/identity' package. ` +
        `Install it alongside powerautodocs, or switch to apiKeyEnv-based auth.`
      );
    }
    const credential = new DefaultAzureCredential();
    const tokenProvider = getBearerTokenProvider(credential, 'https://cognitiveservices.azure.com/.default');
    return tokenProvider();
  };
}
