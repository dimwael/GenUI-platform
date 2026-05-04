import { useState, useRef, useEffect, useCallback } from 'react';
import { CanvasConversation, Message } from '../types';
import ConversationNode from './ConversationNode';
import Minimap from './Minimap';
import './Canvas.css';

interface Props {
  darkMode: boolean;
  selectedModel: string;
  layoutTrigger?: number;
  fitAllTrigger?: number;
  resetZoomTrigger?: number;
  focusNodeId?: string | null;
  onNodesChange?: (nodes: Array<{ id: string; label: string }>) => void;
  /** Loaded canvas data — when this changes, Canvas resets to the loaded state */
  loadedCanvas?: {
    id: string;
    conversations: CanvasConversation[];
    highlights: Record<string, { text: string; color: string; messageIndex: number }>;
  } | null;
  /** Emits every time canvas state changes (debounced by parent) */
  onCanvasChange?: (state: {
    conversations: CanvasConversation[];
    highlights: Record<string, { text: string; color: string; messageIndex: number }>;
    zoom: number;
  }) => void;
}

const COLORS = [
  '#FF2D55', '#FF375F', '#FF453A', '#30D158',
  '#32D74B', '#0A84FF', '#0984FF', '#BF5AF2',
  '#FF9F0A', '#FFD60A',
];

const NODE_W = 780;
const COLLAPSED_H = 48;
const EXPANDED_H = 400;
// Vertical anchor for side-center arrows — always the header midpoint,
// which is consistent regardless of node content height.
const ARROW_ANCHOR_Y = COLLAPSED_H / 2; // 24px from top

export default function Canvas({
  darkMode,
  selectedModel,
  layoutTrigger,
  fitAllTrigger,
  resetZoomTrigger,
  focusNodeId,
  onNodesChange,
  loadedCanvas,
  onCanvasChange,
}: Props) {
  const [conversations, setConversations] = useState<CanvasConversation[]>([
    { id: '1', parentId: null, messages: [], x: 2250, y: 2250, model: selectedModel },
  ]);

  // Keep the root node's model in sync when the header model selector changes
  const prevSelectedModel = useRef(selectedModel);
  useEffect(() => {
    if (prevSelectedModel.current !== selectedModel) {
      prevSelectedModel.current = selectedModel;
      setConversations(prev =>
        prev.map(c => (c.model === prevSelectedModel.current || c.id === '1')
          ? { ...c, model: selectedModel }
          : c
        )
      );
    }
  }, [selectedModel]);
  const [dragging, setDragging] = useState<{
    from: string;
    text: string;
    startX: number;
    startY: number;
    messageIndex: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [highlights, setHighlights] = useState<{
    [key: string]: { text: string; color: string; messageIndex: number };
  }>({});
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [draggingBubble, setDraggingBubble] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Viewport tracking for the minimap
  const [viewport, setViewport] = useState({ scrollLeft: 0, scrollTop: 0, viewW: 0, viewH: 0 });
  // Transient flash marker for the root node after a merge — clears automatically
  const [flashNodeId, setFlashNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Compute full message history from root down to (and including) a given conversation.
  // Called at send-time so it's always fresh.
  const getFullHistory = useCallback(
    (convId: string): Message[] => {
      const conv = conversations.find(c => c.id === convId);
      if (!conv) return [];
      if (!conv.parentId) return conv.messages;
      return [...getFullHistory(conv.parentId), ...conv.messages];
    },
    [conversations],
  );

  const handleDragStart = (
    id: string,
    text: string,
    x: number,
    y: number,
    messageIndex: number,
  ) => {
    setDragging({ from: id, text, startX: x, startY: y, messageIndex });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      setMousePos({ x: e.clientX, y: e.clientY });
    } else if (panning && canvasRef.current) {
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      canvasRef.current.scrollLeft = panning.scrollLeft - dx;
      canvasRef.current.scrollTop = panning.scrollTop - dy;
    } else if (draggingBubble && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const newX =
        (e.clientX - rect.left + canvasRef.current.scrollLeft - draggingBubble.offsetX) / zoom;
      const newY =
        (e.clientY - rect.top + canvasRef.current.scrollTop - draggingBubble.offsetY) / zoom;
      setConversations(prev =>
        prev.map(c => (c.id === draggingBubble.id ? { ...c, x: newX, y: newY } : c)),
      );
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragging && canvasRef.current) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - dragging.startX, 2) + Math.pow(e.clientY - dragging.startY, 2),
      );

      if (distance > 100) {
        const parent = conversations.find(c => c.id === dragging.from);
        const lineageColor =
          parent?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];

        // Spawn centered on the drop position. Placement is decided inside the
        // state updater so it sees the freshest `prev` array — prevents two
        // rapid drops colliding at the same spot.
        const dropPos = clientToCanvas(e.clientX, e.clientY);
        const centeredX = dropPos.x - NODE_W / 2;
        const centeredY = dropPos.y - EXPANDED_H / 2;
        const newId = Date.now().toString();

        setConversations(prev => {
          const { x: newX, y: newY } = findClearPosition(centeredX, centeredY, prev);
          const newConv: CanvasConversation = {
            id: newId,
            parentId: dragging.from,
            selectedText: dragging.text,
            messages: [],
            x: newX,
            y: newY,
            color: lineageColor,
            model: parent?.model ?? selectedModel,
          };
          return [...prev, newConv];
        });
        setHighlights(prev => ({
          ...prev,
          [`${dragging.from}-${dragging.messageIndex}`]: {
            text: dragging.text,
            color: lineageColor,
            messageIndex: dragging.messageIndex,
          },
        }));
      }

      setDragging(null);
      window.getSelection()?.removeAllRanges();
    }
    setPanning(null);

    // If a bubble was being dragged, nudge it to a clear spot on release
    // so manual placement can't leave nodes visually stacked.
    if (draggingBubble) {
      const draggedId = draggingBubble.id;
      setConversations(prev => {
        const moved = prev.find(c => c.id === draggedId);
        if (!moved) return prev;
        const others = prev.filter(c => c.id !== draggedId);
        const { x, y } = findClearPosition(moved.x, moved.y, others);
        if (x === moved.x && y === moved.y) return prev;
        return prev.map(c => (c.id === draggedId ? { ...c, x, y } : c));
      });
    }
    setDraggingBubble(null);
  };

  const toggleCollapsed = (id: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c)
    );
  };

  const updateMessages = (id: string, messages: Message[]) => {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, messages } : c)));
  };

  const updateConversationModel = (id: string, model: string) => {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, model } : c)));
  };

  // Create a branch from an inline chip click. Places the new node to the right of
  // the parent at the next clear position.
  const handleBranchFromSelection = (
    parentId: string,
    text: string,
    _clientX: number,
    _clientY: number,
    messageIndex: number,
  ) => {
    const parent = conversations.find(c => c.id === parentId);
    const lineageColor =
      parent?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
    const newId = Date.now().toString();

    setConversations(prev => {
      const p = prev.find(c => c.id === parentId);
      if (!p) return prev;
      const preferred = { x: p.x + NODE_W + 64, y: p.y };
      const { x: newX, y: newY } = findClearPosition(preferred.x, preferred.y, prev);
      const newConv: CanvasConversation = {
        id: newId,
        parentId,
        selectedText: text,
        messages: [],
        x: newX,
        y: newY,
        color: lineageColor,
        model: p.model ?? selectedModel,
      };
      return [...prev, newConv];
    });

    setHighlights(prev => ({
      ...prev,
      [`${parentId}-${messageIndex}`]: {
        text,
        color: lineageColor,
        messageIndex,
      },
    }));

    window.getSelection()?.removeAllRanges();
  };

  // Delete a node and all of its descendants. The root node ('1') cannot be deleted.
  // Also cleans up any highlights that were tied to the deleted nodes.
  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === '1') return;
    setConversations(prev => {
      // Collect all descendants (depth-first)
      const toDelete = new Set<string>([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of prev) {
          if (c.parentId && toDelete.has(c.parentId) && !toDelete.has(c.id)) {
            toDelete.add(c.id);
            changed = true;
          }
        }
      }
      return prev.filter(c => !toDelete.has(c.id));
    });
    // Purge highlights whose key starts with any deleted node id
    setHighlights(prev => {
      const next: typeof prev = {};
      for (const [key, val] of Object.entries(prev)) {
        const ownerId = key.split('-')[0];
        if (ownerId !== nodeId) next[key] = val;
      }
      return next;
    });
  };

  // Merge a child node's conversation back into the root node as a context block.
  const handleMergeToRoot = (childId: string) => {
    setConversations(prev => {
      const child = prev.find(c => c.id === childId);
      const root = prev.find(c => c.id === '1');
      if (!child || !root || child.id === '1') return prev;

      // Build a readable summary block from the child's messages
      const label = child.selectedText
        ? `Branch: "${child.selectedText}"`
        : `Branch (node ${childId})`;

      const transcript = child.messages
        .map(m => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const mergeMessage: Message = {
        role: 'user',
        content: `--- Merged from ${label} ---\n\n${transcript}\n\n--- End of merged branch ---`,
      };

      return prev.map(c => {
        if (c.id === '1') return { ...c, messages: [...c.messages, mergeMessage] };
        if (c.id === childId) return { ...c, mergedToRoot: true };
        return c;
      });
    });

    // Flash the root briefly so the user sees where the merged content landed
    setFlashNodeId('1');
    window.setTimeout(() => setFlashNodeId(prev => (prev === '1' ? null : prev)), 1200);
  };

  const nodeHeight = (conv: CanvasConversation) =>
    conv.collapsed ? COLLAPSED_H : EXPANDED_H;

  // Find a position near (preferredX, preferredY) that doesn't overlap any existing node.
  // Strategy: if preferred is clear, use it. Otherwise try slotting next to each existing
  // node (right, below, left, above) and pick the clear candidate closest to preferred.
  const findClearPosition = (
    preferredX: number,
    preferredY: number,
    existing: CanvasConversation[],
  ): { x: number; y: number } => {
    const PAD = 32; // minimum gap between nodes

    const nodeBox = (c: CanvasConversation) => ({
      x: c.x,
      y: c.y,
      w: NODE_W,
      h: nodeHeight(c),
    });

    const overlaps = (x: number, y: number) =>
      existing.some(c => {
        const b = nodeBox(c);
        return (
          x < b.x + b.w + PAD &&
          x + NODE_W + PAD > b.x &&
          y < b.y + b.h + PAD &&
          y + EXPANDED_H + PAD > b.y
        );
      });

    // 1. Preferred spot is already clear
    if (!overlaps(preferredX, preferredY)) {
      return { x: preferredX, y: preferredY };
    }

    // 2. Build candidate list: for every existing node, try slotting to its
    //    right / below / left / above with a full-node-size offset.
    type C = { x: number; y: number; dist: number };
    const candidates: C[] = [];
    const distSq = (x: number, y: number) =>
      (x - preferredX) * (x - preferredX) + (y - preferredY) * (y - preferredY);

    for (const c of existing) {
      const b = nodeBox(c);
      const slots = [
        { x: b.x + b.w + PAD,            y: b.y },                  // right, aligned top
        { x: b.x + b.w + PAD,            y: preferredY },           // right, at preferred y
        { x: b.x - NODE_W - PAD,         y: b.y },                  // left, aligned top
        { x: b.x - NODE_W - PAD,         y: preferredY },           // left, at preferred y
        { x: b.x,                        y: b.y + b.h + PAD },      // below, aligned left
        { x: preferredX,                 y: b.y + b.h + PAD },      // below, at preferred x
        { x: b.x,                        y: b.y - EXPANDED_H - PAD },// above, aligned left
        { x: preferredX,                 y: b.y - EXPANDED_H - PAD },// above, at preferred x
      ];
      for (const s of slots) {
        if (!overlaps(s.x, s.y)) {
          candidates.push({ ...s, dist: distSq(s.x, s.y) });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      return { x: candidates[0].x, y: candidates[0].y };
    }

    // 3. Fallback: walk rightward from preferred until clear
    let x = preferredX;
    const y = preferredY;
    for (let i = 0; i < 50; i++) {
      x += NODE_W + PAD;
      if (!overlaps(x, y)) return { x, y };
    }

    // Absolute worst case — stack far below the lowest node
    const maxBottom = existing.reduce(
      (m, c) => Math.max(m, c.y + nodeHeight(c)),
      preferredY,
    );
    return { x: preferredX, y: maxBottom + PAD };
  };

  // Side-center arrow routing: always exit from the left or right midpoint
  // of each node, anchored at the header center (consistent regardless of content height).
  const getSmartPath = (
    parent: CanvasConversation,
    child: CanvasConversation,
  ) => {
    const pCx = parent.x + NODE_W / 2;
    const cCx = child.x + NODE_W / 2;

    let x1: number, y1: number, x2: number, y2: number;

    if (cCx >= pCx) {
      x1 = parent.x + NODE_W; y1 = parent.y + ARROW_ANCHOR_Y;
      x2 = child.x;           y2 = child.y + ARROW_ANCHOR_Y;
    } else {
      x1 = parent.x;         y1 = parent.y + ARROW_ANCHOR_Y;
      x2 = child.x + NODE_W; y2 = child.y + ARROW_ANCHOR_Y;
    }

    const dx = x2 - x1;
    const CURVE = Math.max(Math.abs(dx) * 0.45, 80);
    const cp1x = x1 + (cCx >= pCx ? CURVE : -CURVE);
    const cp2x = x2 - (cCx >= pCx ? CURVE : -CURVE);

    return { path: `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2 };
  };

  // Live drag preview — exit from left or right side center toward cursor
  const getDragPath = (src: CanvasConversation, endX: number, endY: number) => {
    const sCx = src.x + NODE_W / 2;
    const y1 = src.y + ARROW_ANCHOR_Y;
    const x1 = endX >= sCx ? src.x + NODE_W : src.x;
    const dx = endX - x1;
    const CURVE = Math.max(Math.abs(dx) * 0.45, 80);
    const cp1x = x1 + (endX >= sCx ? CURVE : -CURVE);
    const cp2x = endX - (endX >= sCx ? CURVE : -CURVE);
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${endY}, ${endX} ${endY}`;
  };

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.scrollLeft =
        2250 - canvasRef.current.clientWidth / 2 + 250;
      canvasRef.current.scrollTop =
        2250 - canvasRef.current.clientHeight / 2 + 250;
      // Seed viewport state
      setViewport({
        scrollLeft: canvasRef.current.scrollLeft,
        scrollTop: canvasRef.current.scrollTop,
        viewW: canvasRef.current.clientWidth,
        viewH: canvasRef.current.clientHeight,
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '=') {
        e.preventDefault();
        setZoom(z => Math.min(+(z + 0.1).toFixed(1), 2));
      } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(+(z - 0.1).toFixed(1), 0.5));
      } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track scroll / resize to keep the minimap viewport indicator accurate
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      setViewport({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        viewW: el.clientWidth,
        viewH: el.clientHeight,
      });
    };
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // When a new canvas is loaded from the sidebar, replace all state
  const loadedCanvasId = loadedCanvas?.id;
  useEffect(() => {
    if (!loadedCanvas) return;
    setConversations(loadedCanvas.conversations);
    setHighlights(loadedCanvas.highlights);
    // Center viewport on root for a fresh feel
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      const root = loadedCanvas.conversations.find(c => !c.parentId) ?? loadedCanvas.conversations[0];
      if (!root) return;
      canvasRef.current.scrollLeft =
        root.x - canvasRef.current.clientWidth / 2 + NODE_W / 2;
      canvasRef.current.scrollTop =
        root.y - canvasRef.current.clientHeight / 2 + EXPANDED_H / 2;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedCanvasId]);

  // Emit changes upward for auto-save
  useEffect(() => {
    if (!onCanvasChange) return;
    onCanvasChange({ conversations, highlights, zoom });
  }, [conversations, highlights, zoom, onCanvasChange]);

  // Report node list upward for the command palette
  useEffect(() => {
    if (!onNodesChange) return;
    onNodesChange(
      conversations.map(c => {
        const firstMsg = c.messages.find(m => m.role === 'user')?.content ?? '';
        const preview = firstMsg.slice(0, 60) || (c.id === '1' ? 'Root node' : 'Empty branch');
        return { id: c.id, label: preview };
      }),
    );
  }, [conversations, onNodesChange]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      (e.target as HTMLElement).classList.contains('canvas-inner')
    ) {
      setPanning({
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: canvasRef.current?.scrollLeft ?? 0,
        scrollTop: canvasRef.current?.scrollTop ?? 0,
      });
    }
  };

  const handleBubbleDragStart = (id: string, offsetX: number, offsetY: number) => {
    setDraggingBubble({ id, offsetX, offsetY });
  };

  // Convert client coords to canvas-inner coords for the live drag line
  const clientToCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const scrollLeft = canvasRef.current?.scrollLeft ?? 0;
    const scrollTop = canvasRef.current?.scrollTop ?? 0;
    return {
      x: (clientX - (rect?.left ?? 0) + scrollLeft) / zoom,
      y: (clientY - (rect?.top ?? 0) + scrollTop) / zoom,
    };
  };

  // Auto-layout: arrange nodes by lineage using a simple tree walk.
  // Root stays put; children spread horizontally under their parent,
  // siblings spaced evenly, depth increases vertically.
  const autoLayout = () => {
    setConversations(prev => {
      if (prev.length === 0) return prev;

      const root = prev.find(c => !c.parentId) ?? prev[0];
      const H_GAP = NODE_W + 80;        // horizontal spacing between siblings
      const V_GAP = EXPANDED_H + 120;   // vertical spacing between generations

      // Build child index
      const childrenOf = new Map<string, string[]>();
      for (const c of prev) {
        if (c.parentId) {
          childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
        }
      }

      // Compute subtree widths bottom-up (number of leaves under each node × H_GAP)
      const widthOf = new Map<string, number>();
      const computeWidth = (id: string): number => {
        const kids = childrenOf.get(id) ?? [];
        if (kids.length === 0) {
          widthOf.set(id, H_GAP);
          return H_GAP;
        }
        const w = kids.reduce((sum, kid) => sum + computeWidth(kid), 0);
        widthOf.set(id, w);
        return w;
      };
      computeWidth(root.id);

      // Walk top-down placing nodes centered above their subtree span
      const positions = new Map<string, { x: number; y: number }>();
      const place = (id: string, leftEdge: number, depth: number) => {
        const w = widthOf.get(id) ?? H_GAP;
        const x = leftEdge + w / 2 - NODE_W / 2;
        const y = root.y + depth * V_GAP;
        positions.set(id, { x, y });

        let cursor = leftEdge;
        for (const kid of childrenOf.get(id) ?? []) {
          place(kid, cursor, depth + 1);
          cursor += widthOf.get(kid) ?? H_GAP;
        }
      };
      place(root.id, root.x - (widthOf.get(root.id) ?? H_GAP) / 2 + NODE_W / 2, 0);

      return prev.map(c => {
        const p = positions.get(c.id);
        return p ? { ...c, x: p.x, y: p.y } : c;
      });
    });

    // Fit after layout settles
    requestAnimationFrame(() => requestAnimationFrame(fitAll));
  };

  // Fit all conversation nodes into view
  const fitAll = () => {
    if (!canvasRef.current || conversations.length === 0) return;
    const NODE_H = 400;
    const xs = conversations.map(c => c.x);
    const ys = conversations.map(c => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + NODE_W;
    const maxY = Math.max(...ys) + NODE_H;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const viewW = canvasRef.current.clientWidth;
    const viewH = canvasRef.current.clientHeight;
    const padding = 80;
    const newZoom = Math.min(
      (viewW - padding * 2) / contentW,
      (viewH - padding * 2) / contentH,
      1.5,
    );
    const clampedZoom = Math.max(0.3, +newZoom.toFixed(2));
    setZoom(clampedZoom);
    // After zoom state updates, scroll to center the content
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      const scaledMinX = minX * clampedZoom;
      const scaledMinY = minY * clampedZoom;
      const scaledW = contentW * clampedZoom;
      const scaledH = contentH * clampedZoom;
      canvasRef.current.scrollLeft = scaledMinX - (canvasRef.current.clientWidth - scaledW) / 2;
      canvasRef.current.scrollTop  = scaledMinY - (canvasRef.current.clientHeight - scaledH) / 2;
    });
  };

  // Jump to a node by centering it in the viewport
  const jumpToNode = useCallback(
    (id: string) => {
      const conv = conversations.find(c => c.id === id);
      if (!conv || !canvasRef.current) return;
      const el = canvasRef.current;
      const targetX = (conv.x + NODE_W / 2) * zoom - el.clientWidth / 2;
      const targetY = (conv.y + EXPANDED_H / 2) * zoom - el.clientHeight / 2;
      el.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
    },
    [conversations, zoom],
  );

  // Jump to a canvas coordinate (used by minimap click)
  const jumpToCoord = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!canvasRef.current) return;
      const el = canvasRef.current;
      el.scrollTo({
        left: canvasX * zoom - el.clientWidth / 2,
        top: canvasY * zoom - el.clientHeight / 2,
        behavior: 'smooth',
      });
    },
    [zoom],
  );

  // React to external triggers from the command palette / header
  useEffect(() => { if (layoutTrigger) autoLayout(); /* eslint-disable-line */ }, [layoutTrigger]);
  useEffect(() => { if (fitAllTrigger) fitAll(); /* eslint-disable-line */ }, [fitAllTrigger]);
  useEffect(() => { if (resetZoomTrigger) setZoom(1); }, [resetZoomTrigger]);
  useEffect(() => {
    if (!focusNodeId) return;
    // Strip timestamp suffix used to force re-trigger
    const id = focusNodeId.split(':')[0];
    jumpToNode(id);
  }, [focusNodeId, jumpToNode]);

  return (
    <div
      ref={canvasRef}
      className={`canvas ${darkMode ? 'dark' : ''}`}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: panning ? 'grabbing' : 'grab' }}
    >
      <div className="zoom-controls">
        <button onClick={() => setZoom(z => Math.min(+(z + 0.1).toFixed(1), 2))} title="Zoom In (Cmd/Ctrl +)">+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(+(z - 0.1).toFixed(1), 0.5))} title="Zoom Out (Cmd/Ctrl -)">−</button>
        <button onClick={() => setZoom(1)} title="Reset Zoom (Cmd/Ctrl 0)">⟲</button>
        <button onClick={fitAll} title="Fit all nodes in view">⊞</button>
        <button onClick={autoLayout} title="Auto-arrange nodes by lineage">⇲</button>
      </div>

      <div
        className={`canvas-inner ${darkMode ? 'dark' : ''}`}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg className="connections">
          <defs>
            {COLORS.map((color, i) => (
              <marker
                key={i}
                id={`arrowhead-${i}`}
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 12 4 L 0 8 Z" fill={color} />
              </marker>
            ))}
            {/* Dedicated open-chevron arrowhead used only for merge-back arrows */}
            {COLORS.map((color, i) => (
              <marker
                key={`merge-${i}`}
                id={`merge-arrow-${i}`}
                markerWidth="14"
                markerHeight="14"
                refX="11"
                refY="6"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path
                  d="M 1 1 L 11 6 L 1 11"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </marker>
            ))}
            {/* Subtle glow filter for dark mode connection lines — restrained */}
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Permanent connection lines — smart port routing (draw.io style) */}
          {conversations.map(conv => {
            if (!conv.parentId || !conv.color) return null;
            const parent = conversations.find(c => c.id === conv.parentId);
            if (!parent) return null;
            const colorIndex = COLORS.indexOf(conv.color);
            const { path, x1, y1, x2, y2 } = getSmartPath(parent, conv);
            return (
              <g key={conv.id}>
                <path
                  d={path}
                  className="lineage-arrow-path"
                  stroke={conv.color}
                  strokeWidth={darkMode ? 2.5 : 2}
                  fill="none"
                  filter={darkMode ? 'url(#neon-glow)' : undefined}
                  markerEnd={`url(#arrowhead-${colorIndex >= 0 ? colorIndex : 0})`}
                />
                {/* Port dots — source and target connection points */}
                <circle cx={x1} cy={y1} r={4} fill={conv.color} opacity={0.85} />
                <circle cx={x2} cy={y2} r={4} fill={conv.color} opacity={0.85} />
              </g>
            );
          })}

          {/* Merge-back arrows — routed through bottom/top ports so they never
              overlap the lineage arrows. Style: dashed curve with a distinct
              open-chevron arrowhead plus a small "↩" glyph near the start. */}
          {conversations.map(conv => {
            if (!conv.mergedToRoot || conv.id === '1') return null;
            const root = conversations.find(c => c.id === '1');
            if (!root) return null;

            // Source: bottom-center of child. Target: bottom-center of root.
            // The curve dips below both nodes to make it obviously a "return" path.
            const childH = conv.collapsed ? COLLAPSED_H : EXPANDED_H;
            const rootH = root.collapsed ? COLLAPSED_H : EXPANDED_H;
            const x1 = conv.x + NODE_W / 2;
            const y1 = conv.y + childH;
            const x2 = root.x + NODE_W / 2;
            const y2 = root.y + rootH;

            // Dip down by a fixed offset so the curve lives below both nodes
            const dip = 120;
            const cp1x = x1;
            const cp1y = y1 + dip;
            const cp2x = x2;
            const cp2y = y2 + dip;
            const path = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

            const color = conv.color ?? '#6366f1';
            const colorIndex = COLORS.indexOf(color);
            const markerId = `merge-arrow-${colorIndex >= 0 ? colorIndex : 0}`;

            return (
              <g key={`merge-${conv.id}`} className="merge-arrow-group">
                <path
                  d={path}
                  className="merge-arrow-path"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="8 5"
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.9}
                  markerEnd={`url(#${markerId})`}
                />
                {/* Origin dot at the child's bottom */}
                <circle cx={x1} cy={y1} r={4} fill={color} opacity={0.95} />
              </g>
            );
          })}
          {dragging && (() => {
            const parent = conversations.find(c => c.id === dragging.from);
            const color = parent?.color ?? COLORS[0];
            const colorIndex = COLORS.indexOf(color);
            const srcNode = conversations.find(c => c.id === dragging.from);
            const end = clientToCanvas(mousePos.x, mousePos.y);
            const d = srcNode
              ? getDragPath(srcNode, end.x, end.y)
              : `M ${end.x} ${end.y}`;
            return (
              <path
                d={d}
                stroke={color}
                strokeWidth="3"
                strokeDasharray="8 4"
                fill="none"
                markerEnd={`url(#arrowhead-${colorIndex >= 0 ? colorIndex : 0})`}
                style={{ filter: 'drop-shadow(0 0 6px currentColor)', opacity: 0.85 }}
              />
            );
          })()}
        </svg>

        {conversations.map(conv => (
          <ConversationNode
            key={conv.id}
            conversation={conv}
            darkMode={darkMode}
            selectedModel={selectedModel}
            highlights={highlights}
            getFullHistory={getFullHistory}
            onDragStart={handleDragStart}
            onBranchFromSelection={handleBranchFromSelection}
            onBubbleDragStart={handleBubbleDragStart}
            onUpdateMessages={updateMessages}
            onUpdateModel={updateConversationModel}
            collapsed={conv.collapsed ?? false}
            onToggleCollapsed={() => toggleCollapsed(conv.id)}
            onMergeToRoot={conv.id !== '1' ? () => handleMergeToRoot(conv.id) : undefined}
            mergedToRoot={conv.mergedToRoot ?? false}
            onDelete={conv.id !== '1' ? () => handleDeleteNode(conv.id) : undefined}
            flash={flashNodeId === conv.id}
          />
        ))}
      </div>

      <Minimap
        darkMode={darkMode}
        conversations={conversations}
        canvasW={5000}
        canvasH={5000}
        nodeW={NODE_W}
        nodeH={EXPANDED_H}
        scrollLeft={viewport.scrollLeft}
        scrollTop={viewport.scrollTop}
        viewW={viewport.viewW}
        viewH={viewport.viewH}
        zoom={zoom}
        onJump={jumpToCoord}
      />
    </div>
  );
}
