import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '../types';
import './MessageBubble.css';

interface Props {
  message: Message;
  messageIndex: number;
  conversationId: string;
  darkMode: boolean;
  highlight?: { text: string; color: string; messageIndex: number };
  onDragStart: (text: string, x: number, y: number) => void;
  onBranchFromSelection?: (text: string, clientX: number, clientY: number) => void;
  onCopy: (text: string) => void;
}

export default function MessageBubble({
  message,
  messageIndex,
  darkMode,
  highlight,
  onDragStart,
  onCopy,
}: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0 && selection && bubbleRef.current?.contains(selection.anchorNode)) {
      e.preventDefault();
      onDragStart(text, e.clientX, e.clientY);
    }
  };

  // Highlight matching text inside a plain string chunk
  const applyHighlight = (text: string) => {
    if (!highlight || highlight.messageIndex !== messageIndex) return text;
    const parts = text.split(highlight.text);
    if (parts.length === 1) return text;
    return (
      <>
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <span className="highlight" style={{ backgroundColor: highlight.color }}>
                {highlight.text}
              </span>
            )}
          </span>
        ))}
      </>
    );
  };

  return (
    <div className="bubble-container">
      <div
        ref={bubbleRef}
        className={`bubble ${message.role} ${darkMode ? 'dark' : ''}`}
        onMouseDown={handleMouseDown}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Render inline text nodes with highlight support
            p: ({ children }) => <p className="md-p">{children}</p>,
            strong: ({ children }) => <strong>{children}</strong>,
            em: ({ children }) => <em>{children}</em>,
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-');
              return isBlock
                ? <code className={`md-code-block ${darkMode ? 'dark' : ''} ${className ?? ''}`}>{children}</code>
                : <code className={`md-code-inline ${darkMode ? 'dark' : ''}`}>{children}</code>;
            },
            pre: ({ children }) => (
              <pre className={`md-pre ${darkMode ? 'dark' : ''}`}>{children}</pre>
            ),
            ul: ({ children }) => <ul className="md-ul">{children}</ul>,
            ol: ({ children }) => <ol className="md-ol">{children}</ol>,
            li: ({ children }) => <li className="md-li">{children}</li>,
            h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
            h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
            h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
            blockquote: ({ children }) => (
              <blockquote className={`md-blockquote ${darkMode ? 'dark' : ''}`}>{children}</blockquote>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className={`md-link ${darkMode ? 'dark' : ''}`}>
                {children}
              </a>
            ),
            hr: () => <hr className={`md-hr ${darkMode ? 'dark' : ''}`} />,
            table: ({ children }) => (
              <div className={`md-table-wrap ${darkMode ? 'dark' : ''}`}>
                <table className="md-table">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="md-thead">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="md-tr">{children}</tr>,
            th: ({ children }) => <th className="md-th">{children}</th>,
            td: ({ children }) => <td className="md-td">{children}</td>,
          }}
        >
          {message.content}
        </ReactMarkdown>
        {/* Overlay highlight on top of rendered markdown if needed */}
        {highlight && highlight.messageIndex === messageIndex && (
          <span style={{ display: 'none' }}>{applyHighlight(message.content)}</span>
        )}
      </div>
      {message.role === 'assistant' && (
        <button
          className={`copy-btn ${darkMode ? 'dark' : ''}`}
          onClick={() => onCopy(message.content)}
          title="Copy message"
        >
          📋
        </button>
      )}
    </div>
  );
}
