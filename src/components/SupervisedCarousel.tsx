import { useState, useEffect } from 'react';
import './SupervisedCarousel.css';

export interface Slide {
  question: string;
  options: string[];
}

interface Props {
  slides: Slide[];
  darkMode: boolean;
  onSubmit: (answers: Record<number, string[]>) => void;
  onCancel: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export default function SupervisedCarousel({ slides, darkMode, onSubmit, onCancel }: Props) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  // Per-slide free-text custom answer
  const [customText, setCustomText] = useState<Record<number, string>>({});
  const [customOpen, setCustomOpen] = useState<Record<number, boolean>>({});
  const [animDir, setAnimDir] = useState<'in' | 'out-left' | 'out-right'>('in');
  const [visible, setVisible] = useState(true);

  const navigate = (dir: 'next' | 'prev') => {
    const next = dir === 'next' ? current + 1 : current - 1;
    if (next < 0 || next >= slides.length) return;
    setAnimDir(dir === 'next' ? 'out-left' : 'out-right');
    setVisible(false);
    setTimeout(() => {
      setCurrent(next);
      setAnimDir('in');
      setVisible(true);
    }, 180);
  };

  const toggle = (slideIdx: number, option: string) => {
    setAnswers(prev => {
      const existing = prev[slideIdx] ?? [];
      const updated = existing.includes(option)
        ? existing.filter(o => o !== option)
        : [...existing, option];
      return { ...prev, [slideIdx]: updated };
    });
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack arrow keys while the user is typing a custom answer
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') navigate('next');
      if (e.key === 'ArrowLeft') navigate('prev');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, slides.length]);

  // Merge custom text answers into the submitted record, only including non-empty entries
  const buildFinalAnswers = (): Record<number, string[]> => {
    const merged: Record<number, string[]> = { ...answers };
    for (const [idxStr, text] of Object.entries(customText)) {
      const idx = Number(idxStr);
      const trimmed = text.trim();
      if (trimmed.length === 0) continue;
      merged[idx] = [...(merged[idx] ?? []), trimmed];
    }
    return merged;
  };

  const handleSubmit = () => onSubmit(buildFinalAnswers());
  const handleSkip = () => onSubmit({});

  const slide = slides[current];
  const selected = answers[current] ?? [];
  const isLast = current === slides.length - 1;
  const progress = ((current + 1) / slides.length) * 100;

  // Count slides that have at least one checkbox answer OR a non-empty custom text
  const totalAnswered = slides.reduce((n, _, i) => {
    const hasChecks = (answers[i]?.length ?? 0) > 0;
    const hasText = (customText[i]?.trim().length ?? 0) > 0;
    return n + (hasChecks || hasText ? 1 : 0);
  }, 0);

  return (
    <div
      className={`carousel-overlay ${darkMode ? 'dark' : ''}`}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="carousel-header">
        <span className="carousel-label">🔍 Supervised Mode</span>
        <span className="carousel-answered">{totalAnswered}/{slides.length} answered</span>
      </div>

      {/* Progress bar */}
      <div className="carousel-progress-track">
        <div className="carousel-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Dots */}
      <div className="carousel-dots">
        {slides.map((_, i) => {
          const hasAnswer =
            (answers[i]?.length ?? 0) > 0 || (customText[i]?.trim().length ?? 0) > 0;
          return (
            <span
              key={i}
              className={`carousel-dot ${i === current ? 'active' : ''} ${hasAnswer ? 'answered' : ''}`}
              onClick={() => {
                setAnimDir(i > current ? 'out-left' : 'out-right');
                setVisible(false);
                setTimeout(() => { setCurrent(i); setAnimDir('in'); setVisible(true); }, 180);
              }}
            />
          );
        })}
      </div>

      {/* Slide */}
      <div className={`carousel-slide ${visible ? `anim-${animDir}` : 'anim-hidden'}`}>
        <div className="carousel-counter">Question {current + 1} of {slides.length}</div>
        <h3 className="carousel-question">{slide.question}</h3>
        <div className="carousel-options">
          {slide.options.map((opt, i) => (
            <label
              key={opt}
              className={`carousel-option ${selected.includes(opt) ? 'checked' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(current, opt)}
              />
              <span className="carousel-letter">{LETTERS[i] ?? i + 1}</span>
              <span className="carousel-option-text">{opt}</span>
              {selected.includes(opt) && <span className="carousel-check">✓</span>}
            </label>
          ))}

          {/* Free-text "Other" option */}
          {!customOpen[current] ? (
            <button
              type="button"
              className="carousel-option carousel-option-other-trigger"
              onClick={() =>
                setCustomOpen(prev => ({ ...prev, [current]: true }))
              }
            >
              <span className="carousel-letter">✎</span>
              <span className="carousel-option-text">Other — write your own answer</span>
            </button>
          ) : (
            <div
              className={`carousel-option carousel-option-other ${
                (customText[current]?.trim().length ?? 0) > 0 ? 'checked' : ''
              }`}
            >
              <span className="carousel-letter">✎</span>
              <input
                type="text"
                className="carousel-option-input"
                placeholder="Type your own answer…"
                value={customText[current] ?? ''}
                onChange={e =>
                  setCustomText(prev => ({ ...prev, [current]: e.target.value }))
                }
                autoFocus
              />
              <button
                type="button"
                className="carousel-option-clear"
                onClick={() => {
                  setCustomText(prev => ({ ...prev, [current]: '' }));
                  setCustomOpen(prev => ({ ...prev, [current]: false }));
                }}
                aria-label="Remove custom answer"
                title="Remove"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="carousel-nav">
        <button className="carousel-btn secondary" onClick={onCancel}>Cancel</button>
        <div className="carousel-nav-right">
          <button
            className="carousel-btn ghost"
            onClick={handleSkip}
            title="Skip all questions and get the answer based on the original prompt"
          >
            Skip ⏭
          </button>
          {current > 0 && (
            <button className="carousel-btn secondary" onClick={() => navigate('prev')}>← Back</button>
          )}
          {!isLast ? (
            <button className="carousel-btn primary" onClick={() => navigate('next')}>
              Next →
            </button>
          ) : (
            <button className="carousel-btn send" onClick={handleSubmit}>
              Get Answer ✦
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
