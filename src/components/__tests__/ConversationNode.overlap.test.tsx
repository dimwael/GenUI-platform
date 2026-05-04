/**
 * Bug Condition Exploration Test — Task 1
 *
 * Validates: Requirements 2.1, 2.2
 *
 * PURPOSE: This test MUST FAIL on the current (unfixed) code.
 * Failure confirms the bug exists: the drag handle is absolutely positioned
 * over the model selector / supervised toggle, intercepting clicks.
 *
 * DO NOT fix the code to make this test pass — that is done in Task 3.
 */

// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConversationNode from '../ConversationNode';
import { CanvasConversation } from '../../types';
import { DEFAULT_MODEL } from '../../constants/models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return !(
    a.right <= b.left ||
    b.right <= a.left ||
    a.bottom <= b.top ||
    b.bottom <= a.top
  );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseConversation: CanvasConversation = {
  id: 'test-conv-1',
  parentId: null,
  x: 100,
  y: 100,
  messages: [],
  model: DEFAULT_MODEL,
};

const defaultProps = {
  conversation: baseConversation,
  darkMode: false,
  selectedModel: DEFAULT_MODEL,
  highlights: {},
  getFullHistory: () => [],
  onDragStart: vi.fn(),
  onBubbleDragStart: vi.fn(),
  onUpdateMessages: vi.fn(),
  onUpdateModel: vi.fn(),
  collapsed: false,
  onToggleCollapsed: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — drag handle overlap (Task 1)', () => {
  /**
   * Property 1: Fault Condition
   * The drag handle bounding rect MUST NOT overlap the model selector bounding rect.
   *
   * On unfixed code this FAILS because .drag-handle has position:absolute and
   * sits at top:10px / right:14px — directly over the right-aligned controls.
   *
   * Validates: Requirements 2.1, 2.2
   */
  it('drag handle bounding rect does NOT overlap bubble-model-select bounding rect', () => {
    const { container } = render(<ConversationNode {...defaultProps} />);

    const dragHandle = container.querySelector('.drag-handle') as HTMLElement;
    const modelSelect = container.querySelector('.bubble-model-select') as HTMLElement;

    expect(dragHandle).not.toBeNull();
    expect(modelSelect).not.toBeNull();

    const dragRect = dragHandle.getBoundingClientRect();
    const selectRect = modelSelect.getBoundingClientRect();

    // Counterexample if this fails:
    // dragRect overlaps selectRect — drag handle is floating over the model selector
    expect(
      rectsOverlap(dragRect, selectRect),
      `Counterexample: drag handle rect ${JSON.stringify(dragRect.toJSON())} overlaps model select rect ${JSON.stringify(selectRect.toJSON())}`,
    ).toBe(false);
  });

  /**
   * Property 1 (structural): The drag handle MUST NOT be a direct child of
   * .conversation-node with position:absolute.
   *
   * On unfixed code this FAILS because:
   *   - dragHandle.parentElement is .conversation-node (not .bubble-header)
   *   - getComputedStyle(dragHandle).position === 'absolute'
   *
   * Validates: Requirements 2.1
   */
  it('drag handle is NOT a direct child of .conversation-node with position:absolute', () => {
    const { container } = render(<ConversationNode {...defaultProps} />);

    const conversationNode = container.querySelector('.conversation-node') as HTMLElement;
    const dragHandle = container.querySelector('.drag-handle') as HTMLElement;

    expect(conversationNode).not.toBeNull();
    expect(dragHandle).not.toBeNull();

    const isDirectChild = dragHandle.parentElement === conversationNode;
    const isAbsolute = getComputedStyle(dragHandle).position === 'absolute';

    // Counterexample if this fails:
    // parentElement is .conversation-node AND position is 'absolute'
    // — confirms the bug: drag handle is taken out of flow and overlays controls
    expect(
      isDirectChild && isAbsolute,
      `Counterexample: .drag-handle is a direct child of .conversation-node (isDirectChild=${isDirectChild}) ` +
      `AND has position:absolute (isAbsolute=${isAbsolute}). ` +
      `This confirms the bug — drag handle is absolutely positioned over the controls.`,
    ).toBe(false);
  });

  /**
   * Structural assertion: after the fix, .drag-handle should be the first child
   * of .bubble-header (not a sibling of it).
   *
   * On unfixed code this FAILS because .drag-handle is rendered BEFORE .bubble-header
   * as a sibling, not inside it.
   *
   * Validates: Requirements 2.1
   */
  it('drag handle is the first child of .bubble-header (not a sibling)', () => {
    const { container } = render(<ConversationNode {...defaultProps} />);

    const bubbleHeader = container.querySelector('.bubble-header') as HTMLElement;
    const dragHandle = container.querySelector('.drag-handle') as HTMLElement;

    expect(bubbleHeader).not.toBeNull();
    expect(dragHandle).not.toBeNull();

    // Counterexample if this fails:
    // dragHandle.parentElement is NOT .bubble-header — it is .conversation-node
    expect(
      dragHandle.parentElement,
      `Counterexample: .drag-handle parentElement is "${dragHandle.parentElement?.className}" ` +
      `but expected it to be inside .bubble-header. ` +
      `This confirms the bug — drag handle is a sibling of .bubble-header, not a child.`,
    ).toBe(bubbleHeader);

    expect(
      bubbleHeader.firstElementChild,
      `Counterexample: first child of .bubble-header is "${bubbleHeader.firstElementChild?.className}" ` +
      `but expected .drag-handle to be first.`,
    ).toBe(dragHandle);
  });
});
