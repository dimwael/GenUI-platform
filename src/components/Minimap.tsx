import { useRef } from 'react';
import { CanvasConversation } from '../types';
import './Minimap.css';

interface Props {
  darkMode: boolean;
  conversations: CanvasConversation[];
  canvasW: number;
  canvasH: number;
  nodeW: number;
  nodeH: number;
  scrollLeft: number;
  scrollTop: number;
  viewW: number;
  viewH: number;
  zoom: number;
  onJump: (canvasX: number, canvasY: number) => void;
}

const MAP_W = 180;
const MAP_H = 130;

export default function Minimap({
  darkMode,
  conversations,
  canvasW,
  canvasH,
  nodeW,
  nodeH,
  scrollLeft,
  scrollTop,
  viewW,
  viewH,
  zoom,
  onJump,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  if (conversations.length === 0) return null;

  const sx = MAP_W / canvasW;
  const sy = MAP_H / canvasH;

  const handleClick = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasX = mx / sx;
    const canvasY = my / sy;
    onJump(canvasX, canvasY);
  };

  // Viewport indicator — the visible area of the canvas in minimap space
  const vpX = (scrollLeft / zoom) * sx;
  const vpY = (scrollTop / zoom) * sy;
  const vpW = (viewW / zoom) * sx;
  const vpH = (viewH / zoom) * sy;

  return (
    <div
      ref={ref}
      className={`minimap ${darkMode ? 'dark' : ''}`}
      onClick={handleClick}
      title="Click to jump to area"
    >
      <svg width={MAP_W} height={MAP_H}>
        {/* Nodes */}
        {conversations.map(c => (
          <rect
            key={c.id}
            x={c.x * sx}
            y={c.y * sy}
            width={nodeW * sx}
            height={(c.collapsed ? 48 : nodeH) * sy}
            rx={2}
            fill={c.color ?? (darkMode ? '#4f46e5' : '#6366f1')}
            opacity={0.8}
          />
        ))}
        {/* Connection lines */}
        {conversations.map(c => {
          if (!c.parentId) return null;
          const parent = conversations.find(p => p.id === c.parentId);
          if (!parent) return null;
          const x1 = (parent.x + nodeW / 2) * sx;
          const y1 = (parent.y + 24) * sy;
          const x2 = (c.x + nodeW / 2) * sx;
          const y2 = (c.y + 24) * sy;
          return (
            <line
              key={`l-${c.id}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={c.color ?? '#9ca3af'}
              strokeWidth={0.6}
              opacity={0.5}
            />
          );
        })}
        {/* Viewport rectangle */}
        <rect
          x={Math.max(0, vpX)}
          y={Math.max(0, vpY)}
          width={Math.min(vpW, MAP_W)}
          height={Math.min(vpH, MAP_H)}
          fill="none"
          stroke={darkMode ? '#a5b4fc' : '#4f46e5'}
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
