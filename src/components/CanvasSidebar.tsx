import { useState, useMemo } from 'react';
import { CanvasIndexEntry, readCanvas, searchableText } from '../utils/storage';
import './CanvasSidebar.css';

interface Props {
  darkMode: boolean;
  entries: CanvasIndexEntry[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function CanvasSidebar({
  darkMode,
  entries,
  activeId,
  collapsed,
  onToggleCollapsed,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [query, setQuery] = useState('');

  // Filter entries by query. For short queries we filter on title+summary only
  // (cheap). For longer queries we load each doc and do full-text matching.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    if (q.length <= 2) {
      return entries.filter(
        e =>
          e.title.toLowerCase().includes(q) ||
          e.summary?.toLowerCase().includes(q),
      );
    }
    return entries.filter(e => {
      if (e.title.toLowerCase().includes(q)) return true;
      if (e.summary?.toLowerCase().includes(q)) return true;
      const doc = readCanvas(e.id);
      return doc ? searchableText(doc).includes(q) : false;
    });
  }, [entries, query]);

  const startRename = (entry: CanvasIndexEntry) => {
    setRenamingId(entry.id);
    setRenameValue(entry.title);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <aside className={`sidebar ${darkMode ? 'dark' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <span className="sidebar-title">History</span>}
        <button
          className="sidebar-collapse"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label="Toggle sidebar"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed && (
        <>
          <button className="sidebar-new" onClick={onNew}>
            <span>+</span> New Canvas
          </button>

          <div className="sidebar-search">
            <span className="sidebar-search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search canvases…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="sidebar-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="sidebar-list">
            {filtered.length === 0 && entries.length === 0 && (
              <div className="sidebar-empty">No saved canvases yet</div>
            )}
            {filtered.length === 0 && entries.length > 0 && (
              <div className="sidebar-empty">No matches for "{query}"</div>
            )}
            {filtered.map(entry => {
              const isActive = entry.id === activeId;
              const isRenaming = renamingId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`sidebar-item ${isActive ? 'active' : ''}`}
                  onClick={() => !isRenaming && onSelect(entry.id)}
                >
                  {isRenaming ? (
                    <input
                      className="sidebar-rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="sidebar-item-main">
                        <div className="sidebar-item-title">{entry.title}</div>
                        {entry.summary && (
                          <div className="sidebar-item-summary">{entry.summary}</div>
                        )}
                        <div className="sidebar-item-meta">
                          {entry.nodeCount} node{entry.nodeCount === 1 ? '' : 's'} · {formatRelativeTime(entry.updatedAt)}
                        </div>
                      </div>
                      <div className="sidebar-item-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="sidebar-action"
                          onClick={() => startRename(entry)}
                          title="Rename"
                          aria-label="Rename canvas"
                        >
                          ✎
                        </button>
                        <button
                          className="sidebar-action danger"
                          onClick={() => onDelete(entry.id)}
                          title="Delete"
                          aria-label="Delete canvas"
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
