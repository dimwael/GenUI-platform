import { useState, useEffect, useRef, useCallback } from 'react';
import Canvas from './components/Canvas';
import CommandPalette from './components/CommandPalette';
import CanvasSidebar from './components/CanvasSidebar';
import WelcomeGuide from './components/WelcomeGuide';
import Settings from './components/Settings';
import { MODEL_PROVIDERS, DEFAULT_MODEL } from './constants/models';
import { CanvasConversation } from './types';
import { apiPost } from './utils/apiFetch';
import {
  readIndex,
  readCanvas,
  writeCanvas,
  trashCanvas,
  restoreCanvas,
  purgeExpiredTrash,
  getActiveCanvasId,
  setActiveCanvasId,
  deriveTitle,
  newId,
  countAllMessages,
  buildTranscript,
  CanvasIndexEntry,
  CanvasDoc,
} from './utils/storage';
import ToastStack, { ToastMessage } from './components/Toast';
import './App.css';

function getInitialDarkMode(): boolean {
  const stored = localStorage.getItem('gtc-dark-mode');
  if (stored !== null) return stored === 'true';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function getSidebarCollapsed(): boolean {
  return localStorage.getItem('gtc-sidebar-collapsed') === 'true';
}

function isWelcomeDismissed(): boolean {
  // One-time migration: the old "gtc-welcome-dismissed" flag was a forever-dismiss
  // from when there was no opt-out checkbox. Clear it so users can see the new
  // guide + opt-out flow. The new flag is "gtc-welcome-optout".
  if (localStorage.getItem('gtc-welcome-dismissed') !== null) {
    localStorage.removeItem('gtc-welcome-dismissed');
  }
  return localStorage.getItem('gtc-welcome-optout') === 'true';
}

function makeFreshDoc(model: string): CanvasDoc {
  return {
    id: newId(),
    title: 'Untitled Canvas',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    conversations: [
      { id: '1', parentId: null, messages: [], x: 2250, y: 2250, model },
    ],
    highlights: {},
    zoom: 1,
  };
}

function App() {
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layoutTrigger, setLayoutTrigger] = useState(0);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [resetZoomTrigger, setResetZoomTrigger] = useState(0);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [nodeList, setNodeList] = useState<Array<{ id: string; label: string }>>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getSidebarCollapsed);
  // Global opt-out: once true, never show the welcome guide again on any canvas.
  const [welcomePermanentlyDismissed, setWelcomePermanentlyDismissed] =
    useState(isWelcomeDismissed);
  // Per-session dismissals: IDs of canvases on which the user has closed the guide
  // without opting out. Resets on reload so new empty canvases get the guide again.
  const [dismissedForCanvas, setDismissedForCanvas] = useState<Set<string>>(
    () => new Set(),
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Canvas persistence state
  const [entries, setEntries] = useState<CanvasIndexEntry[]>([]);
  const [activeDoc, setActiveDoc] = useState<CanvasDoc | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  // Initial load: restore the active canvas or create a fresh one
  useEffect(() => {
    // Purge any trashed canvases older than 30 days on startup
    purgeExpiredTrash();

    const idx = readIndex();
    setEntries(idx);

    const activeId = getActiveCanvasId();
    if (activeId) {
      const doc = readCanvas(activeId);
      // Don't restore a trashed canvas as active
      if (doc && !doc.trashedAt) {
        setActiveDoc(doc);
        return;
      }
    }
    // Fall back to the most recent non-trashed canvas
    const nonTrashed = idx.filter(e => !e.trashedAt);
    if (nonTrashed.length > 0) {
      const doc = readCanvas(nonTrashed[0].id);
      if (doc) {
        setActiveDoc(doc);
        setActiveCanvasId(doc.id);
        return;
      }
    }
    // No saved canvas — create a new one but don't persist yet (wait for first edit)
    const fresh = makeFreshDoc(DEFAULT_MODEL);
    setActiveDoc(fresh);
    setActiveCanvasId(fresh.id);
  }, []);

  // Persist dark mode
  useEffect(() => {
    localStorage.setItem('gtc-dark-mode', String(darkMode));
  }, [darkMode]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('gtc-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced auto-save — use a ref so the callback identity stays stable
  const activeDocRef = useRef<CanvasDoc | null>(null);
  useEffect(() => {
    activeDocRef.current = activeDoc;
  }, [activeDoc]);

  const handleCanvasChange = useCallback(
    (state: {
      conversations: CanvasConversation[];
      highlights: Record<string, { text: string; color: string; messageIndex: number }>;
      zoom: number;
    }) => {
      if (!activeDocRef.current) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        const current = activeDocRef.current;
        if (!current) return;

        // Only save once the user has actually put something in the canvas.
        // This prevents blank "Untitled" entries cluttering the sidebar.
        const hasAnyMessages = state.conversations.some(c => c.messages.length > 0);
        if (!hasAnyMessages) return;

        const updated: CanvasDoc = {
          ...current,
          conversations: state.conversations,
          highlights: state.highlights,
          zoom: state.zoom,
          title: deriveTitle(state.conversations),
          updatedAt: Date.now(),
        };
        writeCanvas(updated);
        setActiveDoc(updated);
        setEntries(readIndex());

        // Fire-and-forget: refresh the AI summary every ~3 new messages.
        const total = countAllMessages(updated);
        const basis = updated.summaryBasis ?? 0;
        if (total >= 3 && total - basis >= 3) {
          refreshSummary(updated);
        }
      }, 400);
    },
    [],
  );

  // Generate a one-line summary for a doc and persist it.
  // Uses the model assigned to the root node (falls back to selectedModel).
  const refreshSummary = async (doc: CanvasDoc) => {
    const transcript = buildTranscript(doc);
    if (!transcript) return;
    const root = doc.conversations.find(c => !c.parentId) ?? doc.conversations[0];
    const model = root?.model ?? selectedModel;
    try {
      const res = await apiPost('/api/summarize', { transcript, model });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.summary) return;
      // Read fresh from storage to avoid overwriting subsequent edits
      const latest = readCanvas(doc.id);
      if (!latest) return;
      const updated: CanvasDoc = {
        ...latest,
        summary: data.summary,
        summaryBasis: countAllMessages(latest),
      };
      writeCanvas(updated);
      if (activeDocRef.current?.id === doc.id) setActiveDoc(updated);
      setEntries(readIndex());
    } catch {
      // Silent failure — summary is a nice-to-have, not critical
    }
  };

  const handleNewCanvas = () => {
    const fresh = makeFreshDoc(selectedModel);
    writeCanvas(fresh);
    setActiveCanvasId(fresh.id);
    setActiveDoc(fresh);
    setEntries(readIndex());
  };

  const handleSelectCanvas = (id: string) => {
    if (id === activeDoc?.id) return;
    const doc = readCanvas(id);
    if (!doc) return;
    setActiveCanvasId(id);
    setActiveDoc(doc);
  };

  const handleRenameCanvas = (id: string, title: string) => {
    const doc = readCanvas(id);
    if (!doc) return;
    const updated = { ...doc, title, updatedAt: Date.now() };
    writeCanvas(updated);
    if (activeDoc?.id === id) setActiveDoc(updated);
    setEntries(readIndex());
  };

  const pushToast = (msg: Omit<ToastMessage, 'id'>) => {
    const id = newId();
    setToasts(prev => [...prev, { ...msg, id }]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleDeleteCanvas = (id: string) => {
    const doc = readCanvas(id);
    if (!doc) return;
    const title = doc.title;

    trashCanvas(id);
    const remaining = readIndex().filter(e => !e.trashedAt);
    setEntries(readIndex());

    // If the active canvas was just trashed, switch to another
    if (activeDoc?.id === id) {
      if (remaining.length > 0) {
        const nextDoc = readCanvas(remaining[0].id);
        if (nextDoc) {
          setActiveDoc(nextDoc);
          setActiveCanvasId(nextDoc.id);
        }
      } else {
        const fresh = makeFreshDoc(selectedModel);
        setActiveDoc(fresh);
        setActiveCanvasId(fresh.id);
      }
    }

    pushToast({
      text: `Deleted "${title}"`,
      actionLabel: 'Undo',
      onAction: () => handleRestoreCanvas(id),
      durationMs: 8000,
    });
  };

  const handleRestoreCanvas = (id: string) => {
    restoreCanvas(id);
    setEntries(readIndex());
    const doc = readCanvas(id);
    if (doc) {
      setActiveDoc(doc);
      setActiveCanvasId(id);
    }
  };

  const dismissWelcome = (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      localStorage.setItem('gtc-welcome-optout', 'true');
      setWelcomePermanentlyDismissed(true);
      return;
    }
    // Session-only dismissal for the currently active canvas
    if (activeDoc?.id) {
      setDismissedForCanvas(prev => {
        const next = new Set(prev);
        next.add(activeDoc.id);
        return next;
      });
    }
  };

  const canvasIsEmpty =
    !!activeDoc && !activeDoc.conversations.some(c => c.messages.length > 0);
  const showWelcome =
    canvasIsEmpty &&
    !welcomePermanentlyDismissed &&
    !!activeDoc &&
    !dismissedForCanvas.has(activeDoc.id);

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <div className="header">
        <div className="left-controls">
          <select
            className="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {Object.entries(MODEL_PROVIDERS).map(([provider, models]) => (
              <optgroup key={provider} label={provider}>
                {models.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            className="cmd-hint"
            onClick={() => setPaletteOpen(true)}
            title="Open command palette (⌘K)"
          >
            <span>⌘K</span>
          </button>
        </div>
        <h1>GenAI Thinking Canvas</h1>
        <div className="right-controls">
          <button className="settings-gear" onClick={() => setSettingsOpen(true)} title="Settings (API keys)" aria-label="Settings">
            <span aria-hidden="true">⚙️</span>
          </button>
          <button className="dark-toggle" onClick={() => setDarkMode(!darkMode)} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            <span className="toggle-icon icon-sun">☀️</span>
            <span className="toggle-icon icon-moon">🌙</span>
          </button>
        </div>
      </div>

      <div className="app-body">
        <CanvasSidebar
          darkMode={darkMode}
          entries={entries.filter(e => !e.trashedAt)}
          activeId={activeDoc?.id ?? null}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(c => !c)}
          onNew={handleNewCanvas}
          onSelect={handleSelectCanvas}
          onRename={handleRenameCanvas}
          onDelete={handleDeleteCanvas}
        />

        {activeDoc && (
          <Canvas
            key={activeDoc.id}
            darkMode={darkMode}
            selectedModel={selectedModel}
            layoutTrigger={layoutTrigger}
            fitAllTrigger={fitAllTrigger}
            resetZoomTrigger={resetZoomTrigger}
            focusNodeId={focusNodeId}
            onNodesChange={setNodeList}
            loadedCanvas={{
              id: activeDoc.id,
              conversations: activeDoc.conversations,
              highlights: activeDoc.highlights,
            }}
            onCanvasChange={handleCanvasChange}
          />
        )}
      </div>

      {showWelcome && (
        <WelcomeGuide darkMode={darkMode} onDismiss={dismissWelcome} />
      )}

      {paletteOpen && (
        <CommandPalette
          darkMode={darkMode}
          nodes={nodeList}
          onClose={() => setPaletteOpen(false)}
          onToggleDark={() => setDarkMode(d => !d)}
          onAutoLayout={() => setLayoutTrigger(t => t + 1)}
          onFitAll={() => setFitAllTrigger(t => t + 1)}
          onResetZoom={() => setResetZoomTrigger(t => t + 1)}
          onJumpToNode={(id) => setFocusNodeId(`${id}:${Date.now()}`)}
        />
      )}

      <ToastStack darkMode={darkMode} toasts={toasts} onDismiss={dismissToast} />

      {settingsOpen && (
        <Settings darkMode={darkMode} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
