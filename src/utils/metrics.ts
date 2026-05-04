// ─── Lightweight per-node metrics store ─────────────────────────────────────
// In-memory (resets on reload). Each conversation node accumulates a small
// timeline of events the inspector drawer renders. Keeps the UI honest — every
// number shown comes from something that actually happened.

export type PhaseTimings = {
  search?: number;       // time spent in /api/search (ms)
  supervised?: number;   // time spent in /api/supervised-questions (ms)
  model?: number;        // time spent in /api/chat (ms)
};

export interface ToolEvent {
  t: number;             // unix ms
  tool: 'tavily' | 'wikipedia' | 'search';
  query: string;
  durationMs: number;
  ok: boolean;
  resultCount?: number;
  source?: string;       // e.g. "tavily", "wikipedia"
}

export interface MessageTiming {
  t: number;             // unix ms when the response arrived
  totalMs: number;       // end-to-end wall time
  phases: PhaseTimings;
  tokensIn?: number;
  tokensOut?: number;
}

export interface NodeMetrics {
  createdAt: number;     // when the node was first seen by the store
  messages: MessageTiming[];
  tools: ToolEvent[];
}

const store = new Map<string, NodeMetrics>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(l => l());
}

function ensure(id: string): NodeMetrics {
  let m = store.get(id);
  if (!m) {
    m = { createdAt: Date.now(), messages: [], tools: [] };
    store.set(id, m);
  }
  return m;
}

export function recordMessage(nodeId: string, timing: MessageTiming) {
  ensure(nodeId).messages.push(timing);
  notify();
}

export function recordTool(nodeId: string, evt: ToolEvent) {
  ensure(nodeId).tools.push(evt);
  notify();
}

export function getMetrics(nodeId: string): NodeMetrics {
  return ensure(nodeId);
}

/** Subscribe to any store change; returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
