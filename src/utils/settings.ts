// ─── User-configurable API keys ──────────────────────────────────────────────
// All keys live in localStorage and are sent to the backend per-request as
// HTTP headers. The server uses them ONLY for the duration of the request and
// never persists them. Env vars on the server act as fallback defaults.

export interface ApiSettings {
  tavilyKey: string;
  openaiKey: string;
  anthropicKey: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string;
  awsRegion: string;
}

const STORAGE_KEY = 'gtc-api-settings';

export const DEFAULT_SETTINGS: ApiSettings = {
  tavilyKey: '',
  openaiKey: '',
  anthropicKey: '',
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsSessionToken: '',
  awsRegion: '',
};

export function readSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(s: ApiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/**
 * Build HTTP headers that carry the user's configured keys to the backend.
 * Only non-empty fields are included.
 */
export function buildApiHeaders(): Record<string, string> {
  const s = readSettings();
  const h: Record<string, string> = {};
  if (s.tavilyKey)          h['x-tavily-key']        = s.tavilyKey;
  if (s.openaiKey)          h['x-openai-key']        = s.openaiKey;
  if (s.anthropicKey)       h['x-anthropic-key']     = s.anthropicKey;
  if (s.awsAccessKeyId)     h['x-aws-access-key-id'] = s.awsAccessKeyId;
  if (s.awsSecretAccessKey) h['x-aws-secret-key']    = s.awsSecretAccessKey;
  if (s.awsSessionToken)    h['x-aws-session-token'] = s.awsSessionToken;
  if (s.awsRegion)          h['x-aws-region']        = s.awsRegion;
  return h;
}
