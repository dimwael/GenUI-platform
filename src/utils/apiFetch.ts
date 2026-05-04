import { buildApiHeaders } from './settings';

/**
 * POST wrapper that automatically forwards the user's API keys (Tavily,
 * OpenAI, Anthropic, AWS) from localStorage to the backend via HTTP headers.
 */
export function apiPost(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildApiHeaders(),
    },
    body: JSON.stringify(body),
  });
}
