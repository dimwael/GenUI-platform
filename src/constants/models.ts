export interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

// All Anthropic (Bedrock) models use EU cross-region inference profiles (eu. prefix)
// IDs sourced from: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
//
// Model IDs carry a provider prefix so the backend can route correctly:
//   openai:*     → OpenAI API        (needs OPENAI_API_KEY or x-openai-key header)
//   anthropic:*  → Anthropic Direct   (needs ANTHROPIC_API_KEY or x-anthropic-key header)
//   anything else → AWS Bedrock       (default)
export const MODEL_PROVIDERS: Record<string, ModelOption[]> = {
  OpenAI: [
    { id: 'openai:gpt-4o',         name: 'GPT-4o',          provider: 'OpenAI' },
    { id: 'openai:gpt-4o-mini',    name: 'GPT-4o Mini',     provider: 'OpenAI' },
    { id: 'openai:gpt-4-turbo',    name: 'GPT-4 Turbo',     provider: 'OpenAI' },
    { id: 'openai:gpt-3.5-turbo',  name: 'GPT-3.5 Turbo',   provider: 'OpenAI' },
  ],
  'Anthropic (Direct)': [
    { id: 'anthropic:claude-opus-4-5-20251101',    name: 'Claude Opus 4.5',    provider: 'Anthropic (Direct)' },
    { id: 'anthropic:claude-sonnet-4-5-20250929',  name: 'Claude Sonnet 4.5',  provider: 'Anthropic (Direct)' },
    { id: 'anthropic:claude-haiku-4-5-20251001',   name: 'Claude Haiku 4.5',   provider: 'Anthropic (Direct)' },
    { id: 'anthropic:claude-3-5-sonnet-20241022',  name: 'Claude 3.5 Sonnet',  provider: 'Anthropic (Direct)' },
  ],
  'Anthropic (Bedrock)': [
    { id: 'eu.anthropic.claude-opus-4-6-v1',              name: 'Claude Opus 4.6',    provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-sonnet-4-6',               name: 'Claude Sonnet 4.6',  provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-opus-4-5-20251101-v1:0',   name: 'Claude Opus 4.5',    provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude Sonnet 4.5',  provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',  name: 'Claude Haiku 4.5',   provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-sonnet-4-20250514-v1:0',   name: 'Claude Sonnet 4',    provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-3-7-sonnet-20250219-v1:0', name: 'Claude 3.7 Sonnet',  provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet',  provider: 'Anthropic (Bedrock)' },
    { id: 'eu.anthropic.claude-3-5-haiku-20241022-v1:0',  name: 'Claude 3.5 Haiku',   provider: 'Anthropic (Bedrock)' },
  ],
  Nova: [
    { id: 'eu.amazon.nova-pro-v1:0',  name: 'Nova Pro',  provider: 'Nova' },
    { id: 'eu.amazon.nova-lite-v1:0', name: 'Nova Lite', provider: 'Nova' },
  ],
  Meta: [
    { id: 'eu.meta.llama3-2-90b-instruct-v1:0', name: 'Llama 3.2 90B', provider: 'Meta' },
    { id: 'eu.meta.llama3-2-11b-instruct-v1:0', name: 'Llama 3.2 11B', provider: 'Meta' },
  ],
  Mistral: [
    { id: 'eu.mistral.mistral-large-2407-v1:0', name: 'Mistral Large', provider: 'Mistral' },
  ],
};

export const DEFAULT_MODEL = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';

export const ALL_MODELS: ModelOption[] = Object.values(MODEL_PROVIDERS).flat();

export function getProviderForModel(modelId: string): string {
  const model = ALL_MODELS.find(m => m.id === modelId);
  return model?.provider ?? 'Anthropic (Bedrock)';
}
