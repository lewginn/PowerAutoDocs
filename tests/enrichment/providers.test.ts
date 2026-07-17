import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProvider,
  AnthropicProvider,
  AzureOpenAIProvider,
} from '../../src/enrichment/providers/index.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../../src/config/schema.js';
import type { AiEnrichmentConfig } from '../../src/config/schema.js';
import { aConfig } from '../fixtures/config.js';

// No mocks anywhere here, per .claude/docs/decisions.md. Both constructors read
// process.env and validate before touching an SDK, so every throw path is
// reachable with vi.stubEnv alone. The two summarise() suites swap the private
// SDK client for a hand-written fake object on an already-constructed instance —
// no vi.mock, no vi.stubGlobal, and no network is possible from either.

// Env var names used by these tests. They must not collide with anything real:
// a leaked ANTHROPIC_API_KEY on a dev machine would make the "unset" tests pass
// for the wrong reason, or worse, hand a real key to a constructor.
const KEY_ENV = 'PADOCS_TEST_FAKE_KEY';
const ENDPOINT_ENV = 'PADOCS_TEST_FAKE_ENDPOINT';
const UNSET_ENV = 'PADOCS_TEST_DEFINITELY_UNSET';
const OTHER_UNSET_ENV = 'PADOCS_TEST_ALSO_DEFINITELY_UNSET';

const FAKE_KEY = 'fake-key-for-tests';
const FAKE_ENDPOINT = 'https://fake-resource.openai.azure.example/';

/**
 * A real AiEnrichmentConfig built from CONFIG_DEFAULTS via the shared factory,
 * so this never drifts from the schema. createProvider takes the aiEnrichment
 * block, which CONFIG_DEFAULTS always populates.
 */
const anAiConfig = (over: Partial<AiEnrichmentConfig> = {}): AiEnrichmentConfig => {
  const ai = aConfig().aiEnrichment!;
  return { ...ai, ...over };
};

/** Overwrite the private SDK client on a constructed provider with a fake. */
const setClient = (provider: object, client: unknown): void => {
  (provider as unknown as { client: unknown }).client = client;
};

beforeEach(() => {
  // The openai SDK silently defaults several constructor args from the ambient
  // environment (openai/azure.js:28). A dev machine or CI runner that happens to
  // export these would change what AzureOpenAIProvider builds, so clear them and
  // let each test state what it means. Anthropic's SDK does the same for its key.
  vi.stubEnv('AZURE_OPENAI_API_KEY', undefined);
  vi.stubEnv('OPENAI_API_VERSION', undefined);
  vi.stubEnv('OPENAI_BASE_URL', undefined);
  vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  vi.stubEnv(KEY_ENV, undefined);
  vi.stubEnv(ENDPOINT_ENV, undefined);
  vi.stubEnv(UNSET_ENV, undefined);
  vi.stubEnv(OTHER_UNSET_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// createProvider
// ---------------------------------------------------------------------------

describe('createProvider', () => {
  it("throws naming the missing block when provider is 'anthropic' with no anthropic config", () => {
    // config/loader.ts validates this at load time, so reaching here means a
    // hand-built config. The message has to say which block is missing or the
    // caller is left guessing.
    expect(() => createProvider(anAiConfig({ provider: 'anthropic', anthropic: undefined })))
      .toThrow(/config\.anthropic is missing/);
  });

  it("throws naming the missing block when provider is 'azure-openai' with no azureOpenAI config", () => {
    expect(() => createProvider(anAiConfig({ provider: 'azure-openai', azureOpenAI: undefined })))
      .toThrow(/config\.azureOpenAI is missing/);
  });

  it('throws on an unknown provider, echoing the offending value', () => {
    const config = anAiConfig({ provider: 'openai' as AiEnrichmentConfig['provider'] });
    expect(() => createProvider(config)).toThrow(/unknown provider 'openai'/);
  });

  it('does not swallow a provider constructor failure', () => {
    // The factory must not translate a real auth misconfiguration into its own
    // generic error — the env var name is the only actionable detail the client has.
    const config = anAiConfig({ provider: 'anthropic', anthropic: { apiKeyEnv: UNSET_ENV } });
    expect(() => createProvider(config)).toThrow(new RegExp(UNSET_ENV));
  });

  it("returns an AnthropicProvider for 'anthropic' with a valid config and the key present", () => {
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    const provider = createProvider(anAiConfig({
      provider: 'anthropic',
      anthropic: { apiKeyEnv: KEY_ENV },
    }));
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(typeof provider.summarise).toBe('function');
  });

  it("returns an AzureOpenAIProvider for 'azure-openai' with a valid config and both env vars present", () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    const provider = createProvider(anAiConfig({
      provider: 'azure-openai',
      azureOpenAI: {
        endpointEnv: ENDPOINT_ENV,
        apiKeyEnv: KEY_ENV,
        deployment: 'gpt-fake-deployment',
        apiVersion: '2024-10-21',
      },
    }));
    expect(provider).toBeInstanceOf(AzureOpenAIProvider);
    expect(typeof provider.summarise).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// AnthropicProvider — construction
// ---------------------------------------------------------------------------

describe('AnthropicProvider construction', () => {
  it('throws naming the env var and the pipeline-secret pattern when the key is unset', () => {
    // This is the message a client sees when their ADO pipeline forgot to map
    // the secret variable. It has to name the variable and point at the fix.
    expect(() => new AnthropicProvider({ apiKeyEnv: UNSET_ENV }))
      .toThrow(new RegExp(`environment variable '${UNSET_ENV}' is not set`));
    expect(() => new AnthropicProvider({ apiKeyEnv: UNSET_ENV }))
      .toThrow(/pipeline secret variables/);
  });

  it('treats an empty-string key as unset rather than authenticating with it', () => {
    // ADO maps an unmapped secret variable to an empty string, not to absent.
    // Failing at construction beats a 401 halfway through a summarisation run.
    vi.stubEnv(KEY_ENV, '');
    expect(() => new AnthropicProvider({ apiKeyEnv: KEY_ENV })).toThrow(/is not set/);
  });

  it('validates the env var before constructing the SDK client', () => {
    // Ordering matters: the SDK is never handed an undefined key, so the failure
    // is always our message rather than an SDK-internal one.
    expect(() => new AnthropicProvider({ apiKeyEnv: UNSET_ENV }))
      .toThrow(/^Anthropic provider:/);
  });

  it('constructs when the key is present', () => {
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    expect(() => new AnthropicProvider({ apiKeyEnv: KEY_ENV })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AnthropicProvider — summarise
// ---------------------------------------------------------------------------

type AnthropicCall = {
  model: string;
  max_tokens: number;
  messages: { role: string; content: string }[];
};

/**
 * A hand-written stand-in for the Anthropic SDK client, shaped to the one call
 * summarise() makes. Passed in by assignment rather than vi.mock — the code
 * under test is still the real provider.
 */
const fakeAnthropicClient = (response: unknown) => {
  const calls: AnthropicCall[] = [];
  return {
    calls,
    client: {
      messages: {
        create: async (args: AnthropicCall) => {
          calls.push(args);
          return response;
        },
      },
    },
  };
};

const anthropicWith = (response: unknown, config: { apiKeyEnv: string; model?: string }) => {
  vi.stubEnv(KEY_ENV, FAKE_KEY);
  const provider = new AnthropicProvider(config);
  const fake = fakeAnthropicClient(response);
  setClient(provider, fake.client);
  return { provider, calls: fake.calls };
};

const textResponse = (text: string, stopReason = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason: stopReason,
});

describe('AnthropicProvider.summarise', () => {
  it('returns the text of the first text block, trimmed', async () => {
    const { provider } = anthropicWith(
      textResponse('\n  A flow that emails the owner on create.\n\n'),
      { apiKeyEnv: KEY_ENV },
    );
    // Untrimmed model output would land straight in a wiki page / .docx heading.
    await expect(provider.summarise('prompt')).resolves.toBe('A flow that emails the owner on create.');
  });

  it('sends DEFAULT_ANTHROPIC_MODEL when config.model is omitted', async () => {
    const { provider, calls } = anthropicWith(textResponse('ok'), { apiKeyEnv: KEY_ENV });
    await provider.summarise('prompt');
    expect(calls[0].model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it('pins the literal value of DEFAULT_ANTHROPIC_MODEL', () => {
    // Asserting `calls[0].model === DEFAULT_ANTHROPIC_MODEL` below proves the
    // constant is *used*, not that it is *correct* — a typo in the constant
    // ('claude-haiku-4.5') would keep that assertion green and 404 every
    // client's first summarisation. Nothing else in the suite pins the literal.
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-haiku-4-5');
  });

  it('BUG: sends an empty model when config.model is an empty string', async () => {
    // `config.model ?? DEFAULT_ANTHROPIC_MODEL` only catches null/undefined, so
    // `model: ''` in doc-gen.config.yml is forwarded verbatim and the SDK rejects
    // the whole run. loader.ts:125 treats model as optional and does not reject
    // empty. Pinned, not blessed — reported as a defect.
    const { provider, calls } = anthropicWith(textResponse('ok'), {
      apiKeyEnv: KEY_ENV,
      model: '',
    });
    await provider.summarise('prompt');
    expect(calls[0].model).toBe('');
  });

  it('sends config.model when one is given', async () => {
    const { provider, calls } = anthropicWith(textResponse('ok'), {
      apiKeyEnv: KEY_ENV,
      model: 'claude-sonnet-4-5',
    });
    await provider.summarise('prompt');
    expect(calls[0].model).toBe('claude-sonnet-4-5');
  });

  it('sends the prompt verbatim as a single user message', async () => {
    const { provider, calls } = anthropicWith(textResponse('ok'), { apiKeyEnv: KEY_ENV });
    await provider.summarise('Summarise this flow:\n- step one');
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'Summarise this flow:\n- step one' }]);
  });

  it('throws when the response holds no text block', async () => {
    // e.g. a tool_use-only or thinking-only response. aiSummariser catches this
    // and skips the component, so the message needs to explain itself in the log.
    const { provider } = anthropicWith({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] }, {
      apiKeyEnv: KEY_ENV,
    });
    await expect(provider.summarise('prompt')).rejects.toThrow(/no text content block/);
  });

  it('throws when the response content array is empty', async () => {
    const { provider } = anthropicWith({ content: [] }, { apiKeyEnv: KEY_ENV });
    await expect(provider.summarise('prompt')).rejects.toThrow(/no text content block/);
  });

  it('skips past a leading non-text block to find the text', async () => {
    // Extended thinking puts a thinking block first; the summary is still there.
    const { provider } = anthropicWith(
      { content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: 'The answer.' }] },
      { apiKeyEnv: KEY_ENV },
    );
    await expect(provider.summarise('prompt')).resolves.toBe('The answer.');
  });

  it('BUG: keeps only the first text block when the response has several', async () => {
    // Not tagged BUG: the API returns one text block per response in practice,
    // so this is pinning current behaviour, not blessing a spec. If a future
    // model splits its prose across blocks, the tail is dropped silently.
    const { provider } = anthropicWith(
      { content: [{ type: 'text', text: 'First half.' }, { type: 'text', text: ' Second half.' }] },
      { apiKeyEnv: KEY_ENV },
    );
    await expect(provider.summarise('prompt')).resolves.toBe('First half.');
  });

  it('BUG: returns a max_tokens-truncated summary without flagging it', async () => {
    // max_tokens is hard-coded to 1024 and stop_reason is never inspected, so a
    // summary the model was cut off mid-sentence on is published to the client's
    // wiki/.docx looking exactly like a complete one. Pinned, not blessed —
    // reported as a defect.
    const { provider } = anthropicWith(
      textResponse('A flow that reads the account record and then', 'max_tokens'),
      { apiKeyEnv: KEY_ENV },
    );
    await expect(provider.summarise('prompt')).resolves.toBe('A flow that reads the account record and then');
  });

  it('BUG: returns a whitespace-only text block as an empty string', async () => {
    // The mirror of the Azure whitespace gap below, on the DEFAULT provider, and
    // the more damaging of the two: aiSummariser.ts:290-295 does not check the
    // returned text, so '' is written to the component's aiSummary AND cached
    // against the component's content hash. The client gets a blank AI summary
    // heading that SURVIVES re-runs — the cache hit at aiSummariser.ts:281-284
    // replays it until the component's own XML changes. Pinned, not blessed.
    const { provider } = anthropicWith(textResponse('   \n  '), { apiKeyEnv: KEY_ENV });
    await expect(provider.summarise('prompt')).resolves.toBe('');
  });

  it('BUG: returns an empty text block as an empty string instead of throwing', async () => {
    // Azure throws "no message content" for exactly this input (see the Azure
    // suite); Anthropic's guard only checks that a text BLOCK exists, never that
    // it has text. Two providers, opposite behaviour on the same degenerate
    // response — the Azure client gets a logged skip, the Anthropic client gets a
    // silently cached blank. Pinned, not blessed — reported as a defect.
    const { provider } = anthropicWith(textResponse(''), { apiKeyEnv: KEY_ENV });
    await expect(provider.summarise('prompt')).resolves.toBe('');
  });

  it('caps max_tokens so one runaway component cannot dominate a run', async () => {
    const { provider, calls } = anthropicWith(textResponse('ok'), { apiKeyEnv: KEY_ENV });
    await provider.summarise('prompt');
    expect(calls[0].max_tokens).toBe(1024);
  });

  it('propagates an SDK failure rather than returning an empty summary', async () => {
    // aiSummariser's skip-and-continue depends on a rejection, not on ''.
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    const provider = new AnthropicProvider({ apiKeyEnv: KEY_ENV });
    setClient(provider, {
      messages: { create: async () => { throw new Error('429 rate_limit_error'); } },
    });
    await expect(provider.summarise('prompt')).rejects.toThrow(/rate_limit_error/);
  });
});

// ---------------------------------------------------------------------------
// AzureOpenAIProvider — construction
// ---------------------------------------------------------------------------

const azureConfig = (over: Record<string, unknown> = {}) => ({
  endpointEnv: ENDPOINT_ENV,
  apiKeyEnv: KEY_ENV,
  deployment: 'gpt-fake-deployment',
  apiVersion: '2024-10-21',
  ...over,
});

describe('AzureOpenAIProvider construction', () => {
  it('throws naming the endpoint env var when it is unset', () => {
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    expect(() => new AzureOpenAIProvider(azureConfig({ endpointEnv: UNSET_ENV })))
      .toThrow(new RegExp(`environment variable '${UNSET_ENV}' is not set`));
  });

  it('checks the endpoint before the key, so a doubly-misconfigured run names the endpoint first', () => {
    // Both missing: the message should be about the endpoint, and must not
    // mention the key env var, or the client fixes the wrong variable first.
    // The two vars are deliberately DIFFERENT names — with the same name on both
    // this assertion could not tell which branch produced the message.
    let message = '';
    try {
      new AzureOpenAIProvider(azureConfig({ endpointEnv: UNSET_ENV, apiKeyEnv: OTHER_UNSET_ENV }));
      expect.unreachable('constructor should have thrown');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/resource endpoint URL/);
    expect(message).toContain(UNSET_ENV);
    expect(message).not.toContain(OTHER_UNSET_ENV);
  });

  it('throws pointing at the config mistake when useManagedIdentity is explicitly false and apiKeyEnv is absent', () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    expect(() => new AzureOpenAIProvider(azureConfig({ apiKeyEnv: undefined, useManagedIdentity: false })))
      .toThrow(/useManagedIdentity is false but apiKeyEnv was not provided/);
  });

  it('takes the key path when useManagedIdentity is omitted, rather than silently trying managed identity', () => {
    // The distinguishing observation is NOT that it throws — the managed-identity
    // branch would construct fine here. It is that it throws the KEY-branch error,
    // which only runs when useManagedIdentity is falsy. An omitted flag defaulting
    // to managed identity would construct silently and 401 at the first summarise.
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    const config = azureConfig({ apiKeyEnv: UNSET_ENV });
    delete (config as Record<string, unknown>).useManagedIdentity;
    expect('useManagedIdentity' in config).toBe(false);
    expect(() => new AzureOpenAIProvider(config as never))
      .toThrow(new RegExp(`environment variable '${UNSET_ENV}' is not set`));
  });

  it('throws naming the key env var when apiKeyEnv points at an unset variable', () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    expect(() => new AzureOpenAIProvider(azureConfig({ apiKeyEnv: UNSET_ENV })))
      .toThrow(new RegExp(`environment variable '${UNSET_ENV}' is not set`));
  });

  it('treats an empty-string key as unset', () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    vi.stubEnv(KEY_ENV, '');
    expect(() => new AzureOpenAIProvider(azureConfig())).toThrow(/is not set/);
  });

  it('constructs with an endpoint and key present', () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    expect(() => new AzureOpenAIProvider(azureConfig())).not.toThrow();
  });

  it('constructs under managed identity with ONLY the endpoint set — the token provider is lazy', () => {
    // @azure/identity is deliberately NOT a dependency of this package. If the
    // token provider were resolved eagerly, this construction would blow up on
    // the missing module. That it does not is the whole point of the deferred
    // import: a client using an API key never pays for @azure/identity.
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    expect(() => new AzureOpenAIProvider(azureConfig({
      apiKeyEnv: undefined,
      useManagedIdentity: true,
    }))).not.toThrow();
  });

  it('ignores an unset apiKeyEnv entirely when useManagedIdentity is true', () => {
    // The key branch must not run at all — otherwise a client migrating to
    // managed identity gets a spurious "key not set" failure.
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    expect(() => new AzureOpenAIProvider(azureConfig({
      apiKeyEnv: UNSET_ENV,
      useManagedIdentity: true,
    }))).not.toThrow();
  });

  it('still requires the endpoint under managed identity', () => {
    expect(() => new AzureOpenAIProvider(azureConfig({
      endpointEnv: UNSET_ENV,
      apiKeyEnv: undefined,
      useManagedIdentity: true,
    }))).toThrow(new RegExp(`environment variable '${UNSET_ENV}' is not set`));
  });
});

// ---------------------------------------------------------------------------
// AzureOpenAIProvider — the SDK's own env-var defaults leaking in
// ---------------------------------------------------------------------------

describe('AzureOpenAIProvider vs ambient openai SDK env vars', () => {
  it('BUG: managed identity dies if AZURE_OPENAI_API_KEY happens to be in the environment', () => {
    // AzureOpenAIProvider.ts:40 passes `apiKey: undefined`, which does NOT
    // suppress the SDK's default — node_modules/openai/azure.js:28 defaults the
    // parameter to readEnv('AZURE_OPENAI_API_KEY'). With a stale key still in the
    // pipeline environment the SDK then sees both a key and a token provider and
    // hard-throws "mutually exclusive" (azure.js:38), naming arguments the client
    // never wrote. Reported as a defect; pinned here, not blessed.
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'stale-fake-key-for-tests');
    expect(() => new AzureOpenAIProvider(azureConfig({
      apiKeyEnv: undefined,
      useManagedIdentity: true,
    }))).toThrow(/mutually exclusive/);
  });

  it('the API key path is immune to the same leak, because it passes a real key', () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'stale-fake-key-for-tests');
    expect(() => new AzureOpenAIProvider(azureConfig())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AzureOpenAIProvider — summarise
// ---------------------------------------------------------------------------

type AzureCall = {
  model: string;
  max_tokens: number;
  messages: { role: string; content: string }[];
};

/** Hand-written stand-in for the openai SDK client, shaped to the one call made. */
const fakeAzureClient = (response: unknown) => {
  const calls: AzureCall[] = [];
  return {
    calls,
    client: {
      chat: {
        completions: {
          create: async (args: AzureCall) => {
            calls.push(args);
            return response;
          },
        },
      },
    },
  };
};

const azureWith = (response: unknown, over: Record<string, unknown> = {}) => {
  vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
  vi.stubEnv(KEY_ENV, FAKE_KEY);
  const provider = new AzureOpenAIProvider(azureConfig(over));
  const fake = fakeAzureClient(response);
  setClient(provider, fake.client);
  return { provider, calls: fake.calls };
};

const choiceResponse = (content: unknown) => ({ choices: [{ message: { content } }] });

describe('AzureOpenAIProvider.summarise', () => {
  it('returns the message content, trimmed', async () => {
    const { provider } = azureWith(choiceResponse('  A workflow that assigns the case.\n'));
    await expect(provider.summarise('prompt')).resolves.toBe('A workflow that assigns the case.');
  });

  it('addresses the deployment name, not a bare model name', async () => {
    // Azure routes on deployment; sending a model id here 404s the whole run.
    const { provider, calls } = azureWith(choiceResponse('ok'), { deployment: 'my-prod-deployment' });
    await provider.summarise('prompt');
    expect(calls[0].model).toBe('my-prod-deployment');
  });

  it('sends the prompt verbatim as a single user message', async () => {
    const { provider, calls } = azureWith(choiceResponse('ok'));
    await provider.summarise('Summarise this plugin:\n- step one');
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'Summarise this plugin:\n- step one' }]);
    expect(calls[0].max_tokens).toBe(1024);
  });

  it('throws when the message content is missing', async () => {
    const { provider } = azureWith(choiceResponse(undefined));
    await expect(provider.summarise('prompt')).rejects.toThrow(/no message content/);
  });

  it('throws when the message content is null', async () => {
    // The Azure SDK types content as string | null; a refusal or a
    // content-filtered completion arrives as null.
    const { provider } = azureWith(choiceResponse(null));
    await expect(provider.summarise('prompt')).rejects.toThrow(/no message content/);
  });

  it('throws when there are no choices at all', async () => {
    const { provider } = azureWith({ choices: [] });
    await expect(provider.summarise('prompt')).rejects.toThrow(/no message content/);
  });

  it('throws rather than publishing an empty summary when content is an empty string', async () => {
    // A blank heading under a component in the wiki is worse than a logged skip.
    const { provider } = azureWith(choiceResponse(''));
    await expect(provider.summarise('prompt')).rejects.toThrow(/no message content/);
  });

  it('BUG: returns a whitespace-only completion as an empty string', async () => {
    // '  ' is truthy, so the guard passes and .trim() yields ''. The component
    // gets an empty AI summary rather than being skipped — inconsistent with the
    // empty-string case above. Pinned, not blessed — reported as a defect.
    const { provider } = azureWith(choiceResponse('   \n  '));
    await expect(provider.summarise('prompt')).resolves.toBe('');
  });

  it('propagates an SDK failure rather than returning an empty summary', async () => {
    vi.stubEnv(ENDPOINT_ENV, FAKE_ENDPOINT);
    vi.stubEnv(KEY_ENV, FAKE_KEY);
    const provider = new AzureOpenAIProvider(azureConfig());
    setClient(provider, {
      chat: { completions: { create: async () => { throw new Error('401 Unauthorized'); } } },
    });
    await expect(provider.summarise('prompt')).rejects.toThrow(/401 Unauthorized/);
  });
});
