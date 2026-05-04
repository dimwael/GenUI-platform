/**
 * Bug Condition Exploration Test — Drag Handle Overlap
 *
 * Property 1: Fault Condition — Drag Handle Overlaps Controls
 * Validates: Requirements 2.1, 2.2
 *
 * CRITICAL: This test MUST FAIL on unfixed code.
 * Failure confirms the bug exists: the drag handle is absolutely positioned
 * as a sibling of .bubble-header, overlapping the model selector and supervised toggle.
 *
 * When this test fails, the counterexamples document the bug condition:
 *   - .drag-handle parentElement is .conversation-node (not .bubble-header)
 *   - getComputedStyle(.drag-handle).position === 'absolute'
 *   - .drag-handle is NOT the first child of .bubble-header
 */

// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConversationNode from './ConversationNode';
import { CanvasConversation } from '../types';
import { DEFAULT_MODEL } from '../constants/models';

const baseConversation: CanvasConversation = {
  id: 'test-node-1',
  parentId: null,
  messages: [],
  x: 100,
  y: 100,
  color: '#0A84FF',
};

const defaultProps = {
  conversation: baseConversation,
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
};

describe('Bug Condition Exploration — Drag Handle Overlap (MUST FAIL on unfixed code)', () => {
  /**
   * Assert: .drag-handle is NOT a direct child of .conversation-node
   * (it should be inside .bubble-header)
   *
   * On unfixed code: dragHandle.parentElement has class 'conversation-node'
   * Expected (fixed): dragHandle.parentElement has class 'bubble-header'
   */
  it('drag handle should be a child of .bubble-header, not a direct child of .conversation-node', () => {
    const { container } = render(<ConversationNode {...defaultProps} />);

    const dragHandle = container.querySelector('.drag-handle');
    expect(dragHandle).not.toBeNull();

    const parent = dragHandle!.parentElement;

    // COUNTEREXAMPLE on unfixed code:
    // parent.className includes 'conversation-node' — drag handle is a sibling of .bubble-header
    expect(parent?.classList.contains('bubble-header')).toBe(true);
    expect(parent?.classList.contains('conversation-node')).toBe(false);
  });

  /**
   * Assert: .drag-handle should NOT have position: absolute in its inline style or class
   * (it should be a normal flex child)
   *
   * On unfixed code: ConversationNode.css sets `.drag-handle { position: absolute; top: 10px; right: 14px; }`
   * This is a CSS rule, not inline style — we check the structural placement instead.
   */
  it('drag handle should be the first child of .bubble-header', () => {
    const { container } = render(<ConversationNode {...defaultProps} />);

    const bubbleHeader = container.querySelector('.bubble-header');
    expect(bubbleHeader).not.toBeNull();

    const firstChild = bubbleHeader!.firstElementChild;

    // COUNTEREXAMPLE on unfixed code:
    // firstChild does NOT have class 'drag-handle' — the drag handle is outside .bubble-header
    expect(firstChild?.classList.contains('drag-handle')).toBe(true);
  });

  /**
   * Assert: .drag-handle should NOT be a sibling of .bubble-header
   *
   * On unfixed code: .drag-handle and .bubble-header are both direct children of .conversation-node
   */
  it('drag handle should not be a sibling of .bubble-header', () => {
    const { container } = render(<ConversationNode {...defaultProps} />);

    const conversationNode = container.querySelector('.conversation-node');
    const dragHandle = container.querySelector('.drag-handle');
    const bubbleHeader = container.querySelector('.bubble-header');

    expect(conversationNode).not.toBeNull();
    expect(dragHandle).not.toBeNull();
    expect(bubbleHeader).not.toBeNull();

    const directChildren = Array.from(conversationNode!.children);

    // COUNTEREXAMPLE on unfixed code:
    // Both .drag-handle and .bubble-header appear in directChildren — they are siblings
    const dragHandleIsDirectChild = directChildren.some(el => el.classList.contains('drag-handle'));
    const bubbleHeaderIsDirectChild = directChildren.some(el => el.classList.contains('bubble-header'));

    // If drag handle is a direct child of conversation-node AND bubble-header is also a direct child,
    // then the drag handle is absolutely positioned over the header controls — the bug condition.
    expect(dragHandleIsDirectChild && bubbleHeaderIsDirectChild).toBe(false);
  });

  /**
   * Assert: with no selectedText (no context badge), the drag handle is still inside .bubble-header
   * Edge case: overlap is even more pronounced without a context badge
   */
  it('drag handle should be inside .bubble-header even when there is no context badge', () => {
    const conversationWithoutBadge: CanvasConversation = {
      ...baseConversation,
      selectedText: undefined,
    };

    const { container } = render(
      <ConversationNode {...defaultProps} conversation={conversationWithoutBadge} />
    );

    const dragHandle = container.querySelector('.drag-handle');
    const bubbleHeader = container.querySelector('.bubble-header');

    expect(dragHandle).not.toBeNull();
    expect(bubbleHeader).not.toBeNull();

    // COUNTEREXAMPLE on unfixed code:
    // dragHandle.parentElement is .conversation-node, not .bubble-header
    expect(dragHandle!.parentElement?.classList.contains('bubble-header')).toBe(true);
  });
});
