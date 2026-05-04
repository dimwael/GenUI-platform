import { useState, useEffect, useRef, useMemo } from 'react';
import './CommandPalette.css';

interface NodeRef {
  id: string;
  label: string;
}

interface Props {
  darkMode: boolean;
  nodes: NodeRef[];
  onClose: () => void;
  onToggleDark: () => void;
  onAutoLayout: () => void;
  onFitAll: () => void;
  onResetZoom: () => void;
  onJumpToNode: (id: string) => void;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  action: () => void;
  keywords?: string;
}

export default function CommandPalette({
  darkMode,
  nodes,
  onClose,
  onToggleDark,
  onAutoLayout,
  onFitAll,
  onResetZoom,
  onJumpToNode,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      {
        id: 'toggle-dark',
        label: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        hint: 'Theme',
        icon: darkMode ? '☀️' : '🌙',
        action: () => { onToggleDark(); onClose(); },
        keywords: 'theme dark light mode',
      },
      {
        id: 'auto-layout',
        label: 'Auto-Layout Canvas',
        hint: 'Arrange nodes by lineage',
        icon: '⊞',
        action: () => { onAutoLayout(); onClose(); },
        keywords: 'arrange layout organize tidy',
      },
      {
        id: 'fit-all',
        label: 'Fit All Nodes',
        hint: 'Zoom to see everything',
        icon: '⊡',
        action: () => { onFitAll(); onClose(); },
        keywords: 'zoom fit view all',
      },
      {
        id: 'reset-zoom',
        label: 'Reset Zoom to 100%',
        hint: '⌘0',
        icon: '⟲',
        action: () => { onResetZoom(); onClose(); },
        keywords: 'zoom reset 100',
      },
    ];
    const nodeCmds: Command[] = nodes.map(n => ({
      id: `node-${n.id}`,
      label: `Jump to: ${n.label}`,
      hint: `Node ${n.id}`,
      icon: '→',
      action: () => { onJumpToNode(n.id); onClose(); },
      keywords: `node jump navigate ${n.label}`,
    }));
    return [...base, ...nodeCmds];
  }, [darkMode, nodes, onClose, onToggleDark, onAutoLayout, onFitAll, onResetZoom, onJumpToNode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.keywords?.toLowerCase().includes(q) ||
      c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIdx]?.action();
    }
  };

  return (
    <div className={`cmd-overlay ${darkMode ? 'dark' : ''}`} onClick={onClose}>
      <div className={`cmd-palette ${darkMode ? 'dark' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="cmd-search">
          <span className="cmd-search-icon">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search nodes…"
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <div className="cmd-list">
          {filtered.length === 0 && (
            <div className="cmd-empty">No matches</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`cmd-item ${i === activeIdx ? 'active' : ''}`}
              onClick={c.action}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="cmd-icon">{c.icon}</span>
              <span className="cmd-label">{c.label}</span>
              {c.hint && <span className="cmd-hint-text">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
