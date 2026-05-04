import { Message } from '../types';

/**
 * Very rough token estimator: ~4 characters per token for English/code.
 * Accurate enough for in-UI cost feedback; not a substitute for server-side billing.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countConversationTokens(messages: Message[]): {
  input: number;
  output: number;
  total: number;
} {
  let input = 0;
  let output = 0;
  for (const m of messages) {
    const t = estimateTokens(m.content);
    if (m.role === 'user') input += t;
    else output += t;
  }
  return { input, output, total: input + output };
}

/**
 * Approximate per-million-token pricing in USD.
 * Values are best-effort; user should treat as a guide, not invoice.
 * Pricing sourced from public AWS Bedrock pages as of late-2025.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  // Anthropic
  'claude-opus':          { in: 15.00, out: 75.00 },
  'claude-sonnet':        { in: 3.00,  out: 15.00 },
  'claude-haiku':         { in: 0.80,  out: 4.00  },
  'claude-3-5-sonnet':    { in: 3.00,  out: 15.00 },
  'claude-3-5-haiku':     { in: 0.80,  out: 4.00  },
  'claude-3-7-sonnet':    { in: 3.00,  out: 15.00 },
  // Amazon Nova
  'nova-pro':             { in: 0.80,  out: 3.20  },
  'nova-lite':            { in: 0.06,  out: 0.24  },
  // Meta
  'llama3-2-90b':         { in: 2.00,  out: 2.00  },
  'llama3-2-11b':         { in: 0.16,  out: 0.16  },
  // Mistral
  'mistral-large':        { in: 2.00,  out: 6.00  },
  // OpenAI
  'gpt-4o':               { in: 2.50,  out: 10.00 },
  'gpt-4o-mini':          { in: 0.15,  out: 0.60  },
  'gpt-4-turbo':          { in: 10.00, out: 30.00 },
  'gpt-3.5-turbo':        { in: 0.50,  out: 1.50  },
};

function priceKey(modelId: string): keyof typeof PRICING | null {
  const id = modelId.toLowerCase();
  // Match most specific first
  if (id.includes('claude-opus')) return 'claude-opus';
  if (id.includes('claude-3-5-sonnet')) return 'claude-3-5-sonnet';
  if (id.includes('claude-3-5-haiku')) return 'claude-3-5-haiku';
  if (id.includes('claude-3-7-sonnet')) return 'claude-3-7-sonnet';
  if (id.includes('claude-haiku')) return 'claude-haiku';
  if (id.includes('claude-sonnet')) return 'claude-sonnet';
  if (id.includes('nova-pro')) return 'nova-pro';
  if (id.includes('nova-lite')) return 'nova-lite';
  if (id.includes('llama3-2-90b')) return 'llama3-2-90b';
  if (id.includes('llama3-2-11b')) return 'llama3-2-11b';
  if (id.includes('mistral-large')) return 'mistral-large';
  if (id.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (id.includes('gpt-4o')) return 'gpt-4o';
  if (id.includes('gpt-4-turbo')) return 'gpt-4-turbo';
  if (id.includes('gpt-3.5')) return 'gpt-3.5-turbo';
  return null;
}

export function estimateCost(modelId: string, inTokens: number, outTokens: number): number {
  const key = priceKey(modelId);
  if (!key) return 0;
  const p = PRICING[key];
  return (inTokens * p.in + outTokens * p.out) / 1_000_000;
}

export function formatCost(cost: number): string {
  if (cost === 0) return '—';
  if (cost < 0.001) return '<$0.001';
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}


/**
 * Maximum input context window (tokens) per model family.
 * Used to render the "context window full" indicator in the UI.
 */
const CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic — Claude models all support at least 200k context
  'claude-opus':          200_000,
  'claude-sonnet':        200_000,
  'claude-haiku':         200_000,
  'claude-3-5-sonnet':    200_000,
  'claude-3-5-haiku':     200_000,
  'claude-3-7-sonnet':    200_000,
  // Amazon Nova
  'nova-pro':             300_000,
  'nova-lite':            300_000,
  // Meta
  'llama3-2-90b':         128_000,
  'llama3-2-11b':         128_000,
  // Mistral
  'mistral-large':        128_000,
  // OpenAI
  'gpt-4o':               128_000,
  'gpt-4o-mini':          128_000,
  'gpt-4-turbo':          128_000,
  'gpt-3.5-turbo':         16_385,
};

const DEFAULT_CONTEXT_LIMIT = 128_000;

export function getContextLimit(modelId: string): number {
  const key = priceKey(modelId);
  if (!key) return DEFAULT_CONTEXT_LIMIT;
  return CONTEXT_LIMITS[key] ?? DEFAULT_CONTEXT_LIMIT;
}

/**
 * Formats a token count compactly, e.g. 12_345 → "12.3K", 215_000 → "215K".
 */
export function formatTokens(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
