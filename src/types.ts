export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  parentId: string | null;
  selectedText?: string;
  messages: Message[];
}

// Extended type used by the canvas — adds spatial and lineage data
export interface CanvasConversation extends Conversation {
  x: number;
  y: number;
  color?: string;
  /** Full message history from root → parent, used as context when sending */
  parentHistory?: Message[];
  model?: string;
  collapsed?: boolean;
  /** True when this node's conversation has been merged back into the root node */
  mergedToRoot?: boolean;
}
