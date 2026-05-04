import { useState } from 'react';
import './WelcomeGuide.css';

interface Props {
  darkMode: boolean;
  /** Called when user dismisses. Receives `true` if they also opted out permanently. */
  onDismiss: (dontShowAgain: boolean) => void;
}

export default function WelcomeGuide({ darkMode, onDismiss }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleDismiss = () => onDismiss(dontShowAgain);

  return (
    <div className={`welcome-guide ${darkMode ? 'dark' : ''}`}>
      <div className="welcome-header">
        <span className="welcome-eyebrow">Get started</span>
        <button
          className="welcome-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss welcome guide"
          title="Dismiss"
        >
          ×
        </button>
      </div>
      <h2 className="welcome-title">Think non-linearly.</h2>
      <p className="welcome-subtitle">Three gestures unlock the canvas:</p>

      <ol className="welcome-steps">
        <li>
          <span className="welcome-step-num">1</span>
          <div>
            <strong>Chat in a node.</strong>
            <span className="welcome-step-detail">
              Type your question below and press Enter. Responses appear in the same node.
            </span>
          </div>
        </li>
        <li>
          <span className="welcome-step-num">2</span>
          <div>
            <strong>Select text to branch.</strong>
            <span className="welcome-step-detail">
              Highlight any text in a response, then drag it onto empty canvas space.
              A new connected branch spawns with that context.
            </span>
          </div>
        </li>
        <li>
          <span className="welcome-step-num">3</span>
          <div>
            <strong>Move, zoom, explore.</strong>
            <span className="welcome-step-detail">
              Drag the ⋮⋮ handle to reposition a node. Pan the empty canvas. Press <kbd>⌘K</kbd> anytime for the command palette.
            </span>
          </div>
        </li>
      </ol>

      <label className="welcome-optout">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={e => setDontShowAgain(e.target.checked)}
        />
        <span>Don't show this again</span>
      </label>

      <button className="welcome-cta" onClick={handleDismiss}>
        Got it, let's go
      </button>
    </div>
  );
}
