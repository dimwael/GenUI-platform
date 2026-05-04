/**
 * Preservation Property Tests — Drag Handle Overlap Fix
 *
 * Property 2: Preservation — Drag Offset Calculation and Control Behavior
 * Validates: Requirements 3.1
 *
 * These tests MUST PASS on the UNFIXED code.
 * They lock in the baseline behavior that must be preserved after the fix.
 *
 * Observed baseline (unfixed code):
 *   handleHeaderMouseDown calls onBubbleDragStart with
 *   (clientX - nodeRect.left, clientY - nodeRect.top)
 *   where nodeRect = e.currentTarget.parentElement.getBoundingClientRect()
 *   and parentElement is .conversation-node (the root element).
 */

// @vitest-environment happy-dom
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import ConversationNode from './ConversationNode';
import { CanvasConversation } from '../types';
import { DEFAULT_MODEL } from '../constants/models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConversation(overrides: Partial<CanvasConversation> = {}): CanvasConversation {
  return {
    id: 'test-node-1',
    parentId: null,
    messages: [],
    x: 100,
    y: 100,
    color: '#0A84FF',
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    conversation: makeConversation(),
    darkMode: false,
    selectedModel: DEFAULT_MODEL,
    highlights: {},
    getFullHistory: vi.fn(() => []),
    onDragStart: vi.fn(),
    onBubbleDragStart: vi.fn(),
    onUpdateMessages: vi.fn(),
    onUpdateModel: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    ...overrides,
  };
}

// ── Structural assertions ─────────────────────────────────────────────────────

describe('Preservation — structural baseline (must pass on unfixed code)', () => {
  it('.drag-handle element is present in the DOM', () => {
    const { container } = render(<ConversationNode {...makeProps()} />);
    expect(container.querySelector('.drag-handle')).not.toBeNull();
  });

  it('.bubble-model-select element is present in the DOM', () => {
    const { container } = render(<ConversationNode {...makeProps()} />);
    expect(container.querySelector('.bubble-model-select')).not.toBeNull();
  });

  it('supervised toggle button is present in the DOM', () => {
    const { container } = render(<ConversationNode {...makeProps()} />);
    const toggle = container.querySelector('.supervised-toggle');
    expect(toggle).not.toBeNull();
  });
});

// ── Control behavior ──────────────────────────────────────────────────────────

describe('Preservation — control behavior (must pass on unfixed code)', () => {
  it('onUpdateModel fires when model selector changes', () => {
    const onUpdateModel = vi.fn();
    const { container } = render(<ConversationNode {...makeProps({ onUpdateModel })} />);

    const select = container.querySelector('.bubble-model-select') as HTMLSelectElement;
    expect(select).not.toBeNull();

    // Pick a different option value than the current one
    const options = Array.from(select.options);
    const otherOption = options.find(o => o.value !== select.value);
    if (!otherOption) return; // skip if only one model

    fireEvent.change(select, { target: { value: otherOption.value } });
    expect(onUpdateModel).toHaveBeenCalledWith('test-node-1', otherOption.value);
  });

  it('supervised toggle fires on click and changes label', () => {
    const { container } = render(<ConversationNode {...makeProps()} />);

    const toggle = container.querySelector('.supervised-toggle') as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    const initialText = toggle.textContent;
    fireEvent.click(toggle);
    expect(toggle.textContent).not.toBe(initialText);
  });
});

// ── Dark mode CSS class ───────────────────────────────────────────────────────

describe('Preservation — dark mode class on .drag-handle (must pass on unfixed code)', () => {
  it('.drag-handle is inside .conversation-node.dark when darkMode=true', () => {
    const { container } = render(<ConversationNode {...makeProps({ darkMode: true })} />);

    const node = container.querySelector('.conversation-node');
    expect(node?.classList.contains('dark')).toBe(true);

    // The drag handle must be a descendant of the dark node so CSS rules apply
    const dragHandle = container.querySelector('.drag-handle');
    expect(dragHandle).not.toBeNull();
    expect(node?.contains(dragHandle)).toBe(true);
  });
});

// ── Property 2: Drag offset calculation ──────────────────────────────────────

describe('Property 2: Preservation — drag offset calculation (Validates: Requirements 3.1)', () => {
  /**
   * For any mousedown on the drag handle, onBubbleDragStart is called with
   * offsets (clientX - nodeRect.left, clientY - nodeRect.top).
   *
   * After the fix, handleHeaderMouseDown uses:
   *   (e.currentTarget as HTMLElement).closest('.conversation-node').getBoundingClientRect()
   *
   * We mock getBoundingClientRect on .conversation-node to return
   * a controlled rect, then fire a mousedown with known clientX/clientY and
   * assert the offsets match.
   */
  it('property: onBubbleDragStart receives (clientX - nodeRect.left, clientY - nodeRect.top) for random mouse positions', () => {
    fc.assert(
      fc.property(
        // Random client coordinates (viewport-relative mouse position)
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 0, max: 2000 }),
        // Random node bounding rect origin
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (clientX, clientY, rectLeft, rectTop) => {
          const onBubbleDragStart = vi.fn();
          const { container } = render(
            <ConversationNode {...makeProps({ onBubbleDragStart })} />
          );

          const dragHandle = container.querySelector('.drag-handle') as HTMLElement;
          expect(dragHandle).not.toBeNull();

          // The fixed handler uses .closest('.conversation-node').getBoundingClientRect().
          // We mock getBoundingClientRect on the .conversation-node element.
          const conversationNode = container.querySelector('.conversation-node') as HTMLElement;
          vi.spyOn(conversationNode, 'getBoundingClientRect').mockReturnValue({
            left: rectLeft,
            top: rectTop,
            right: rectLeft + 780,
            bottom: rectTop + 400,
            width: 780,
            height: 400,
            x: rectLeft,
            y: rectTop,
            toJSON: () => ({}),
          } as DOMRect);

          fireEvent.mouseDown(dragHandle, { clientX, clientY });

          expect(onBubbleDragStart).toHaveBeenCalledTimes(1);
          const [id, offsetX, offsetY] = onBubbleDragStart.mock.calls[0];
          expect(id).toBe('test-node-1');
          expect(offsetX).toBe(clientX - rectLeft);
          expect(offsetY).toBe(clientY - rectTop);

          // Cleanup mocks between iterations
          vi.restoreAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });
});
