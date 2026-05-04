import { useEffect, useState, useSyncExternalStore } from 'react';
import { CanvasConversation } from '../types';
import {
  countConversationTokens,
  estimateCost,
  formatCost,
  formatTokens,
  getContextLimit,
} from '../utils/tokens';
import { getMetrics, subscribe } from '../utils/metrics';
import './NodeInspector.css';

interface Props {
  conversation: CanvasConversation;
  open: boolean;
  darkMode: boolean;
  model: string;
  parentTokens: number;
  contextLevel: 'low' | 'med' | 'high';
  onToggle: () => void;
  onClose: () => void;
}

function useMetrics(nodeId: string) {
  return useSyncExternalStore(
    subscribe,
    () => getMetrics(nodeId),
  );
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Hand-rolled sparkline (no chart lib needed, scales to its container) ──
function LatencySparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;

  // Use a virtual coordinate system — the SVG scales to 100% of its parent
  const W = 100;
  const H = 32;
  const PAD = 2;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = PAD + i * step;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area =
    `M${points[0][0].toFixed(1)} ${H - PAD}` +
    points.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('') +
    `L${points[points.length - 1][0].toFixed(1)} ${H - PAD} Z`;

  const last = points[points.length - 1];
  const lastValue = values[values.length - 1];
  const lastIsSlow = lastValue > max * 0.75 && values.length > 2;

  return (
    <svg
      className="inspector-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <path d={area} className="spark-area" />
      <path d={path} className="spark-line" vectorEffect="non-scaling-stroke" />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={1.8}
        className={`spark-dot ${lastIsSlow ? 'slow' : ''}`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function NodeInspector({
  conversation,
  open,
  darkMode,
  model,
  parentTokens,
  contextLevel,
  onToggle,
  onClose,
}: Props) {
  const metrics = useMetrics(conversation.id);

  // Re-render every second while open so "2m ago" ticks without state churn
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const tokens = countConversationTokens(conversation.messages);
  const cost = estimateCost(model, tokens.input, tokens.output);
  const contextLimit = getContextLimit(model);
  const contextUsed = tokens.total + parentTokens;
  const contextPct = Math.min(100, (contextUsed / contextLimit) * 100);

  // Stacked token bar proportions — clamp to avoid zero-width slivers vanishing
  const total = Math.max(contextLimit, 1);
  const inputPct = (tokens.input / total) * 100;
  const outputPct = (tokens.output / total) * 100;
  const parentPct = (parentTokens / total) * 100;
  const usedPct = inputPct + outputPct + parentPct;
  const headroomPct = Math.max(0, 100 - usedPct);

  const latencies = metrics.messages.map(m => m.totalMs);
  const avgLatency = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return (
    <div
      className={`node-inspector ${open ? 'open' : 'closed'} level-${contextLevel} ${darkMode ? 'dark' : ''}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        // Whole stub is clickable when closed; inside the open drawer only the
        // background is — child controls stop propagation themselves.
        if (!open) onToggle();
      }}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={open ? 'Inspector (open)' : 'Open inspector'}
      title={open ? undefined : 'Click to open inspector'}
    >
      {/* Content shown only when expanded — wrapped so it can fade independently */}
      <div className="inspector-content">
      {/* Close button */}
      <button className="inspector-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close inspector">✕</button>

      {/* ── Head line ─────────────────────────────────────── */}
      <div className="inspector-section inspector-head">
        <div className="inspector-title">Inspector</div>
        <div className="inspector-meta">
          <span className="inspector-model" title={model}>{model.replace(/^(eu|us|ap)\./, '').split('.').pop() ?? model}</span>
          <span className="inspector-dot" />
          <span className="inspector-cost" title={`Estimated cost: ${formatCost(cost)}`}>{formatCost(cost)}</span>
          <span className="inspector-dot" />
          <span className="inspector-age" title={new Date(metrics.createdAt).toLocaleString()}>
            {formatRelativeTime(metrics.createdAt)}
          </span>
        </div>
      </div>

      {/* ── Token split ───────────────────────────────────── */}
      <div className="inspector-section">
        <div className="inspector-row">
          <span className="inspector-kv-label">Context</span>
          <span className="inspector-kv-value">
            {formatTokens(contextUsed)} / {formatTokens(contextLimit)}
            <span className="inspector-kv-pct">{contextPct.toFixed(1)}%</span>
          </span>
        </div>
        <div className="inspector-stackbar" title={`Input ${formatTokens(tokens.input)} · Output ${formatTokens(tokens.output)}${parentTokens > 0 ? ` · Parent ${formatTokens(parentTokens)}` : ''} · Free ${formatTokens(Math.max(0, contextLimit - contextUsed))}`}>
          {parentPct > 0 && (
            <span className="stackbar-segment seg-parent" style={{ width: `${parentPct}%` }} />
          )}
          <span className="stackbar-segment seg-input" style={{ width: `${inputPct}%` }} />
          <span className="stackbar-segment seg-output" style={{ width: `${outputPct}%` }} />
          <span className="stackbar-segment seg-free" style={{ width: `${headroomPct}%` }} />
        </div>
        <div className="inspector-legend">
          {parentTokens > 0 && (
            <span><span className="legend-dot dot-parent" /> parent {formatTokens(parentTokens)}</span>
          )}
          <span><span className="legend-dot dot-input" /> in {formatTokens(tokens.input)}</span>
          <span><span className="legend-dot dot-output" /> out {formatTokens(tokens.output)}</span>
        </div>
      </div>

      {/* ── Latency sparkline ─────────────────────────────── */}
      <div className="inspector-section">
        <div className="inspector-row">
          <span className="inspector-kv-label">Latency</span>
          <span className="inspector-kv-value">
            {latencies.length > 0 ? `avg ${formatMs(avgLatency)}` : '—'}
            {latencies.length > 0 && (
              <span className="inspector-kv-pct">{latencies.length} msg</span>
            )}
          </span>
        </div>
        {latencies.length > 0 ? (
          <LatencySparkline values={latencies} />
        ) : (
          <div className="inspector-empty">Send a message to see latency</div>
        )}
      </div>

      {/* ── Tool activity ─────────────────────────────────── */}
      <div className="inspector-section">
        <div className="inspector-row">
          <span className="inspector-kv-label">Tools</span>
          <span className="inspector-kv-value">
            {metrics.tools.length > 0 ? `${metrics.tools.length} call${metrics.tools.length === 1 ? '' : 's'}` : '—'}
          </span>
        </div>
        {metrics.tools.length > 0 ? (
          <ul className="inspector-tools">
            {metrics.tools.slice().reverse().slice(0, 8).map((t, i) => (
              <li key={i} className={t.ok ? 'tool-ok' : 'tool-fail'}>
                <span className="tool-status" aria-hidden="true">{t.ok ? '✓' : '✗'}</span>
                <span className="tool-query" title={t.query}>{t.query}</span>
                <span className="tool-duration">{formatMs(t.durationMs)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="inspector-empty">Enable 🌐 Web to see tool calls</div>
        )}
      </div>
      </div>
    </div>
  );
}
