import { useState, useRef, useEffect } from 'react';
import { CanvasConversation, Message } from '../types';
import { MODEL_PROVIDERS } from '../constants/models';
import { countConversationTokens, estimateCost, formatCost, getContextLimit, formatTokens } from '../utils/tokens';
import { apiPost } from '../utils/apiFetch';
import MessageBubble from './MessageBubble';
import SupervisedCarousel, { Slide } from './SupervisedCarousel';
import ThinkingIndicator from './ThinkingIndicator';
import NodeInspector from './NodeInspector';
import { recordMessage, recordTool } from '../utils/metrics';
import './ConversationNode.css';
import './SupervisedCarousel.css';

interface Props {
  conversation: CanvasConversation;
  darkMode: boolean;
  selectedModel: string;
  highlights: { [key: string]: { text: string; color: string; messageIndex: number } };
  getFullHistory: (convId: string) => Message[];
  onDragStart: (id: string, text: string, x: number, y: number, messageIndex: number) => void;
  onBranchFromSelection?: (id: string, text: string, clientX: number, clientY: number, messageIndex: number) => void;
  onBubbleDragStart: (id: string, offsetX: number, offsetY: number) => void;
  onUpdateMessages: (id: string, messages: Message[]) => void;
  onUpdateModel: (id: string, model: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onMergeToRoot?: () => void;
  mergedToRoot?: boolean;
  onDelete?: () => void;
  flash?: boolean;
}

type CarouselState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'open'; slides: Slide[]; pendingInput: string };

export default function ConversationNode({
  conversation,
  darkMode,
  selectedModel,
  highlights,
  getFullHistory,
  onDragStart,
  onBranchFromSelection,
  onBubbleDragStart,
  onUpdateMessages,
  onUpdateModel,
  collapsed,
  onToggleCollapsed,
  onMergeToRoot,
  mergedToRoot,
  onDelete,
  flash,
}: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supervised, setSupervised] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [carousel, setCarousel] = useState<CarouselState>({ phase: 'idle' });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message whenever messages change or a response is pending
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    // Smooth scroll to bottom
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [conversation.messages.length, loading]);

  const model = conversation.model ?? selectedModel;

  // Per-node token + cost estimate
  const tokens = countConversationTokens(conversation.messages);
  const cost = estimateCost(model, tokens.input, tokens.output);

  // Context window usage: include parent history for branched nodes so the
  // indicator reflects what the model actually sees.
  const parentTokens = conversation.parentHistory
    ? countConversationTokens(conversation.parentHistory).total
    : 0;
  const contextLimit = getContextLimit(model);
  const contextUsed = tokens.total + parentTokens;
  const contextPct = Math.min(100, (contextUsed / contextLimit) * 100);
  const contextLevel: 'low' | 'med' | 'high' =
    contextPct < 50 ? 'low' : contextPct < 80 ? 'med' : 'high';

  // Fire the actual chat request with enriched context
  const fireChat = async (userInput: string, extraContext?: string) => {
    const t0 = performance.now();
    // On the very first send of a branch node, inject the selected text so the
    // model knows what this thread is about. It's invisible to the user — only
    // the model sees it as part of the prompt content.
    const isFirstSend = conversation.messages.length === 0;
    const branchContext =
      isFirstSend && conversation.selectedText
        ? `This thread branches from the parent conversation. The user selected this excerpt to explore further: "${conversation.selectedText}"`
        : undefined;

    // If web search is enabled, fetch results and fold them into the context
    let webContext: string | undefined;
    let searchMs = 0;
    if (webSearch) {
      const tSearch = performance.now();
      try {
        const searchRes = await apiPost('/api/search', { query: userInput, maxResults: 5 });
        searchMs = performance.now() - tSearch;
        if (searchRes.ok) {
          const { results, answer, source } = await searchRes.json();
          const hasResults = Array.isArray(results) && results.length > 0;
          recordTool(conversation.id, {
            t: Date.now(),
            tool: source === 'wikipedia' ? 'wikipedia' : 'tavily',
            query: userInput,
            durationMs: searchMs,
            ok: true,
            resultCount: hasResults ? results.length : 0,
            source,
          });
          if (hasResults || answer) {
            const parts: string[] = [
              `Web search results for the user's question (via ${source ?? 'web'}). ` +
                `Use these to ground your answer and cite sources inline as [1], [2], etc. ` +
                `End your answer with a "Sources" section listing the URLs you referenced.`,
            ];
            if (answer) {
              parts.push(`Synthesized answer from search provider:\n${answer}`);
            }
            if (hasResults) {
              const formatted = results
                .map(
                  (r: { title: string; url: string; snippet: string }, i: number) =>
                    `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`,
                )
                .join('\n\n');
              parts.push(formatted);
            }
            webContext = parts.join('\n\n');
          }
        } else {
          recordTool(conversation.id, {
            t: Date.now(), tool: 'search', query: userInput,
            durationMs: searchMs, ok: false,
          });
        }
      } catch {
        searchMs = performance.now() - tSearch;
        recordTool(conversation.id, {
          t: Date.now(), tool: 'search', query: userInput,
          durationMs: searchMs, ok: false,
        });
        // Non-fatal — continue without web results
      }
    }

    const contextBlock = [branchContext, webContext, extraContext].filter(Boolean).join('\n\n');
    // `visibleContent` is what the user sees in their bubble.
    // `modelContent` is what the model receives — includes the hidden context.
    const visibleContent = userInput;
    const modelContent = contextBlock
      ? `${userInput}\n\n---\n${contextBlock}`
      : userInput;

    const visibleMessage: Message = { role: 'user', content: visibleContent };
    const newMessages = [...conversation.messages, visibleMessage];
    onUpdateMessages(conversation.id, newMessages);
    setLoading(true);
    setError(null);

    try {
      const parentHistory = getFullHistory(conversation.id);
      // Send the enriched content to the model, but keep the visible bubble clean
      const modelHistory: Message[] = [
        ...parentHistory,
        { role: 'user', content: modelContent },
      ];

      const tModel = performance.now();
      const res = await apiPost('/api/chat', { message: modelContent, history: modelHistory, model });
      const modelMs = performance.now() - tModel;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      onUpdateMessages(conversation.id, [
        ...newMessages,
        { role: 'assistant', content: data.response },
      ]);

      recordMessage(conversation.id, {
        t: Date.now(),
        totalMs: performance.now() - t0,
        phases: { search: searchMs || undefined, model: modelMs },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      onUpdateMessages(conversation.id, conversation.messages);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userInput = input;
    setInput('');

    if (!supervised) {
      await fireChat(userInput);
      return;
    }

    // Supervised mode: fetch clarifying slides first
    setCarousel({ phase: 'loading' });
    try {
      const res = await apiPost('/api/supervised-questions', { message: userInput, model });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const slides: Slide[] = data.slides ?? [];
      if (slides.length === 0) throw new Error('No slides returned');
      setCarousel({ phase: 'open', slides, pendingInput: userInput });
    } catch (err) {
      // Show the error — do NOT silently fall back so the user knows supervised mode failed
      setCarousel({ phase: 'idle' });
      setInput(userInput); // restore input so user can retry
      setError(`Supervised mode error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCarouselSubmit = async (answers: Record<number, string[]>) => {
    if (carousel.phase !== 'open') return;
    const { slides, pendingInput } = carousel;
    setCarousel({ phase: 'idle' });

    // Build a readable summary of the user's answers
    const contextLines = slides
      .map((slide, i) => {
        const chosen = answers[i] ?? [];
        if (chosen.length === 0) return null;
        return `- ${slide.question}\n  → ${chosen.join(', ')}`;
      })
      .filter(Boolean);

    const extraContext = contextLines.length > 0
      ? contextLines.join('\n')
      : undefined;

    await fireChat(pendingInput, extraContext);
  };

  const handleCarouselCancel = () => {
    setCarousel({ phase: 'idle' });
    setInput(carousel.phase === 'open' ? carousel.pendingInput : '');
  };

  const handleDragHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest('.conversation-node')?.getBoundingClientRect();
    if (rect) onBubbleDragStart(conversation.id, e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={`conversation-node ${darkMode ? 'dark' : ''} ${collapsed ? 'collapsed' : ''} ${flash ? 'merge-flash' : ''}`}
      style={{ left: conversation.x, top: conversation.y, borderTopColor: conversation.color ?? 'transparent' }}
    >
      {/* Inspector drawer — always-present shadow stub on the right;
          clicking expands it to reveal the observability content. */}
      <NodeInspector
        conversation={conversation}
        open={inspectorOpen}
        darkMode={darkMode}
        model={model}
        parentTokens={parentTokens}
        contextLevel={contextLevel}
        onToggle={() => setInspectorOpen(o => !o)}
        onClose={() => setInspectorOpen(false)}
      />
      <div className="bubble-header">
        <div
          className="drag-handle"
          onMouseDown={handleDragHandleMouseDown}
          title="Drag to move this node"
          aria-label="Drag to move node"
        >
          <span className="drag-dots">⋮⋮</span>
        </div>
        {conversation.selectedText && (
          <div className="context-badge" style={{ background: conversation.color ?? '#0A84FF' }}>
            Context: &ldquo;{conversation.selectedText}&rdquo;
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {tokens.total > 0 && (
            <span
              className="token-badge"
              title={`Input: ${tokens.input.toLocaleString()} tokens\nOutput: ${tokens.output.toLocaleString()} tokens\nEstimated cost: ${formatCost(cost)}\n\nEstimate only — actual billing may differ.`}
            >
              {tokens.total.toLocaleString()} tok · {formatCost(cost)}
            </span>
          )}
          {contextUsed > 0 && (
            <div
              className={`context-meter level-${contextLevel}`}
              title={`Context window: ${formatTokens(contextUsed)} / ${formatTokens(contextLimit)} tokens used (${contextPct.toFixed(1)}%)${parentTokens > 0 ? `\n  Includes ${formatTokens(parentTokens)} from parent thread` : ''}`}
              aria-label={`Context window ${contextPct.toFixed(0)} percent full`}
            >
              <div className="context-meter-fill" style={{ height: `${contextPct}%` }} />
              <span className="context-meter-label">
                {formatTokens(contextUsed)} / {formatTokens(contextLimit)}
              </span>
            </div>
          )}
          <button
            className={`supervised-toggle ${supervised ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setSupervised(s => !s); }}
            title="Toggle supervised mode"
          >
            🔍 Supervised
          </button>
          <button
            className={`web-search-toggle ${webSearch ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setWebSearch(s => !s); }}
            title={webSearch ? 'Web search ON — results from DuckDuckGo will be included' : 'Enable web search (DuckDuckGo)'}
            aria-label="Toggle web search"
            aria-pressed={webSearch}
          >
            🌐 Web
          </button>
          <select
            className="bubble-model-select"
            value={model}
            onChange={(e) => onUpdateModel(conversation.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            {Object.entries(MODEL_PROVIDERS).map(([provider, models]) => (
              <optgroup key={provider} label={provider}>
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            className="collapse-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
            title={collapsed ? 'Expand node' : 'Collapse node'}
            aria-label={collapsed ? 'Expand node' : 'Collapse node'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
          {onMergeToRoot && (
            <button
              className={`merge-btn ${mergedToRoot ? 'merged' : ''}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); if (!mergedToRoot) onMergeToRoot(); }}
              title={mergedToRoot ? 'Already merged to main node' : 'Merge this conversation back to main node'}
              aria-label="Merge to main node"
            >
              {mergedToRoot ? '✓ Merged' : '↩ Merge'}
            </button>
          )}
          {onDelete && (
            <button
              className="delete-btn"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this node and all its branches?')) onDelete();
              }}
              title="Delete this node and all its branches"
              aria-label="Delete node"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
      <div className="messages" ref={messagesRef} onMouseDown={(e) => e.stopPropagation()}>
        {conversation.messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            messageIndex={i}
            conversationId={conversation.id}
            darkMode={darkMode}
            highlight={highlights[`${conversation.id}-${i}`]}
            onDragStart={(text, clientX, clientY) =>
              onDragStart(conversation.id, text, clientX, clientY, i)
            }
            onBranchFromSelection={
              onBranchFromSelection
                ? (text, clientX, clientY) =>
                    onBranchFromSelection(conversation.id, text, clientX, clientY, i)
                : undefined
            }
            onCopy={(text) => navigator.clipboard.writeText(text)}
          />
        ))}
        {loading && <ThinkingIndicator darkMode={darkMode} />}
        {error && <div className="error-msg">{error}</div>}
      </div>
      )}

      {/* Supervised carousel */}
      {!collapsed && carousel.phase === 'loading' && (
        <div className={`carousel-overlay ${darkMode ? 'dark' : ''}`}>
          <div className="carousel-loading">
            <ThinkingIndicator darkMode={darkMode} />
          </div>
        </div>
      )}
      {!collapsed && carousel.phase === 'open' && (
        <SupervisedCarousel
          slides={carousel.slides}
          darkMode={darkMode}
          onSubmit={handleCarouselSubmit}
          onCancel={handleCarouselCancel}
        />
      )}

      {!collapsed && (
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            webSearch && supervised
              ? 'Web + supervised on — type a message…'
              : webSearch
              ? 'Web search on — type a message…'
              : supervised
              ? 'Supervised mode on — type a message…'
              : 'Type a message…'
          }
          disabled={loading || carousel.phase !== 'idle'}
        />
        <button onClick={sendMessage} disabled={loading || carousel.phase !== 'idle'}>
          {loading ? '…' : 'Send'}
        </button>
      </div>
      )}
    </div>
  );
}
