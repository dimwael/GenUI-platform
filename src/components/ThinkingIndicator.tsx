import { useEffect, useState } from 'react';

// Playful rotating messages shown while the model is generating.
// Kept short (<40 chars) so the indicator stays compact.
const MESSAGES = [
  'Untangling thoughts',
  'Consulting the silicon',
  'Wrangling tokens',
  'Doing the thinking dance',
  'Rummaging through context',
  'Summoning the ghost in the machine',
  'Brewing a response',
  'Teaching electrons to talk',
  'Sorting neurons alphabetically',
  'Polishing the punctuation',
  'Asking the oracle nicely',
  'Warming up the word-pile',
  'Measuring twice, answering once',
];

interface Props {
  darkMode?: boolean;
}

export default function ThinkingIndicator({ darkMode }: Props) {
  const [msgIdx, setMsgIdx] = useState(() => Math.floor(Math.random() * MESSAGES.length));

  // Cycle to a new message every 2.5s so long waits stay entertaining
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx(i => (i + 1 + Math.floor(Math.random() * (MESSAGES.length - 1))) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`thinking ${darkMode ? 'dark' : ''}`} role="status" aria-live="polite">
      <div className="thinking-bubble">
        <span className="thinking-text">{MESSAGES[msgIdx]}</span>
        <span className="thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="thinking-shimmer" aria-hidden="true">
        <span className="shimmer-line" style={{ width: '85%' }} />
        <span className="shimmer-line" style={{ width: '70%' }} />
        <span className="shimmer-line" style={{ width: '55%' }} />
      </div>
    </div>
  );
}
