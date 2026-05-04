import { CanvasConversation } from '../types';

export interface CanvasDoc {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  conversations: CanvasConversation[];
  highlights: Record<string, { text: string; color: string; messageIndex: number }>;
  zoom: number;
  /** AI-generated one-sentence summary, regenerated when message count crosses thresholds */
  summary?: string;
  /** Message count at which the summary was last generated (lets us know when to refresh) */
  summaryBasis?: number;
  /** Timestamp when trashed; undefined means not trashed. Purged after 30 days. */
  trashedAt?: number;
}

export interface CanvasIndexEntry {
  id: string;
  title: string;
  summary?: string;
  updatedAt: number;
  nodeCount: number;
  trashedAt?: number;
}

const INDEX_KEY = 'gtc-canvases';
const DOC_PREFIX = 'gtc-canvas:';
const ACTIVE_KEY = 'gtc-active-canvas';

// ── Index (metadata list shown in the sidebar) ───────────────────────
export function readIndex(): CanvasIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CanvasIndexEntry[];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeIndex(entries: CanvasIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

function upsertIndex(doc: CanvasDoc): void {
  const entries = readIndex();
  const next: CanvasIndexEntry = {
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    updatedAt: doc.updatedAt,
    nodeCount: doc.conversations.length,
    trashedAt: doc.trashedAt,
  };
  const idx = entries.findIndex(e => e.id === doc.id);
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  writeIndex(entries);
}

// ── Individual canvas docs ───────────────────────────────────────────
export function readCanvas(id: string): CanvasDoc | null {
  try {
    const raw = localStorage.getItem(DOC_PREFIX + id);
    return raw ? (JSON.parse(raw) as CanvasDoc) : null;
  } catch {
    return null;
  }
}

export function writeCanvas(doc: CanvasDoc): void {
  const stamped = { ...doc, updatedAt: Date.now() };
  localStorage.setItem(DOC_PREFIX + doc.id, JSON.stringify(stamped));
  upsertIndex(stamped);
}

export function deleteCanvas(id: string): void {
  localStorage.removeItem(DOC_PREFIX + id);
  writeIndex(readIndex().filter(e => e.id !== id));
}

// ── Active canvas tracking ───────────────────────────────────────────
export function getActiveCanvasId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveCanvasId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

// ── Title derivation ─────────────────────────────────────────────────
export function deriveTitle(conversations: CanvasConversation[]): string {
  const root = conversations.find(c => !c.parentId) ?? conversations[0];
  if (!root) return 'Untitled Canvas';
  const firstUserMsg = root.messages.find(m => m.role === 'user')?.content;
  if (!firstUserMsg) return 'Untitled Canvas';
  const clean = firstUserMsg.trim().replace(/\s+/g, ' ');
  return clean.length > 50 ? clean.slice(0, 50) + '…' : clean;
}

// ── UUID helper (no external dep needed) ─────────────────────────────
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Total messages across every node, used to decide when to refresh the summary. */
export function countAllMessages(doc: CanvasDoc): number {
  return doc.conversations.reduce((sum, c) => sum + c.messages.length, 0);
}

/** Build a plain-text transcript of the whole canvas for summary generation. */
export function buildTranscript(doc: CanvasDoc): string {
  const lines: string[] = [];
  for (const conv of doc.conversations) {
    for (const msg of conv.messages) {
      const role = msg.role === 'user' ? 'User' : 'AI';
      lines.push(`${role}: ${msg.content}`);
    }
  }
  return lines.join('\n\n').slice(0, 6000); // cap so we don't blow context
}

/** Full-text search across an index entry and its stored doc content. */
export function searchableText(doc: CanvasDoc): string {
  const parts: string[] = [doc.title];
  if (doc.summary) parts.push(doc.summary);
  for (const c of doc.conversations) {
    for (const m of c.messages) parts.push(m.content);
  }
  return parts.join(' \n ').toLowerCase();
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Mark a canvas as trashed (soft delete) — keeps data for 30 days. */
export function trashCanvas(id: string): void {
  const doc = readCanvas(id);
  if (!doc) return;
  writeCanvas({ ...doc, trashedAt: Date.now() });
}

/** Restore a trashed canvas. */
export function restoreCanvas(id: string): void {
  const doc = readCanvas(id);
  if (!doc) return;
  const { trashedAt: _ignored, ...rest } = doc;
  writeCanvas({ ...rest, trashedAt: undefined });
}

/** Permanently remove items that have been trashed longer than retention. */
export function purgeExpiredTrash(): void {
  const entries = readIndex();
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  for (const e of entries) {
    if (e.trashedAt && e.trashedAt < cutoff) {
      deleteCanvas(e.id);
    }
  }
}
