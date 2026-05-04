# Bedrock Chat Canvas

A spatial chat interface for exploring ideas with LLMs. Highlight any text in a response, branch into a new conversation thread, and watch your thinking unfold on an infinite canvas.

<p align="center">
  <a href="https://github.com/dimwael/GenUI-platform/raw/main/docs/demo.mp4">
    ▶ Watch the demo (MP4)
  </a>
</p>

<!--
To get an inline-playable video in this README:
  1. Open any issue or PR on this repo
  2. Drag docs/demo.mp4 into the comment box
  3. GitHub uploads it and gives you a URL like
     https://user-images.githubusercontent.com/.../demo.mp4
  4. Replace the link block above with:
       https://user-images.githubusercontent.com/.../demo.mp4
     (just the raw URL on its own line — GitHub auto-embeds it as a player)
-->

## Why this exists

Linear chat flattens thought. When a response sparks a tangent, you're stuck between two bad options: derail the main thread, or start a new chat and lose the context. This app treats every exchange as a node on a canvas, so tangents become branches you can return to. Your conversation graph becomes a map of how you thought through the problem.

## Features

- **Branch from selection** — highlight text in any response, spawn a child thread with that text as seed context
- **Infinite canvas** — pan, zoom, drag nodes, collapse subtrees, jump around with the minimap
- **Multi-provider routing** — one UI, talking to AWS Bedrock, OpenAI, or Anthropic. Provider is inferred from the model ID prefix
- **Supervised mode** — the model asks clarifying questions in a slide carousel before answering, so you shape the response up front
- **Web search** — Tavily for quality, Wikipedia as a zero-config fallback
- **Local-first** — canvases live in your browser's localStorage. The server is stateless and never persists your keys
- **Command palette** (`⌘K`), dark mode, markdown and table rendering, token counting, node inspector

## Use cases

- **Research** — start with a broad question, branch into sub-questions as they come up, end with a tree that documents your entire line of inquiry
- **Writing** — draft in the main thread, explore alternative phrasings or counter-arguments in branches, keep everything visible at once
- **Debugging** — paste an error, branch on each hypothesis, prune the dead ends, leave the fix in the trunk
- **Learning a new topic** — ask the main question in the root, branch on every unfamiliar term, build yourself a personal knowledge graph
- **Interview prep** — each question as a node, branch into follow-up questions and variant answers
- **Product decisions** — one node per option, branches for pros/cons/risks, everything side-by-side for comparison

## Getting started

Requirements: Node 18+ and npm.

```bash
git clone <your-fork-url>
cd bedrock-chat-canvas
npm install
```

Start the backend:

```bash
npm run server        # listens on :3001
```

In another terminal, start the frontend:

```bash
npm run dev           # opens on :3000
```

Open http://localhost:3000. You'll land on an empty canvas.

### API keys and internet search

The app supports four external services. All are optional except at least one model provider. Keys are handled per-request and the server never persists them.

| Service | What it enables | Where to get a key |
|---|---|---|
| **AWS Bedrock** | Claude, Nova, Titan, Llama, Mistral via Bedrock | https://console.aws.amazon.com — IAM user or role with `bedrock:InvokeModel` |
| **OpenAI** | GPT models via `openai:*` prefix | https://platform.openai.com/api-keys |
| **Anthropic** | Claude via direct API (`anthropic:*` prefix) | https://console.anthropic.com/settings/keys |
| **Tavily** | High-quality web search inside conversations | https://app.tavily.com (free tier available) |

**Internet search.** The app includes a search tool that hits Tavily first for quality results. If you don't configure a Tavily key, it automatically falls back to Wikipedia — no setup needed, search just works with lower fidelity. If both fail, the search step returns an error and the conversation continues without results.

#### Where to paste your keys

**Option 1 — in-app (recommended).** Click the ⚙️ Settings icon in the top-right, paste your keys into the form, hit Save. Keys live in your browser's `localStorage` and are forwarded to the backend as HTTP headers on each request. Nothing persists server-side. This is the right choice if you're running the app locally or want to keep keys per-device.

**Option 2 — environment variables.** Set any of these before `npm run server`. The server falls back to these when no in-app keys are present. Good for self-hosting or a shared instance.

```bash
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...        # optional, for temporary creds
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
TAVILY_API_KEY=...           # optional; search falls back to Wikipedia without it
```

For Bedrock, the role or user needs `bedrock:InvokeModel` on the models you plan to use, in the region set via `AWS_REGION`.

### Your first branch

1. Type a question, press Enter
2. Wait for the response
3. Select a phrase in the response bubble
4. Click **💬 New Thread** when the button appears
5. A child node spawns with that phrase as its seed context
6. Continue the conversation in the child, or branch again from anything it says

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Command palette |
| `⌘0` | Fit canvas to viewport |
| `⌘+` / `⌘-` | Zoom in / out |
| `Space + drag` | Pan the canvas |
| `Esc` | Close modals |

## Supported models

Model IDs are routed by prefix:

| Prefix | Provider | Example |
|---|---|---|
| `openai:` | OpenAI Chat Completions | `openai:gpt-4o` |
| `anthropic:` | Anthropic Messages API | `anthropic:claude-sonnet-4-5` |
| anything else | AWS Bedrock | `eu.anthropic.claude-haiku-4-5-20251001-v1:0` |

Bedrock handles Anthropic, Amazon Nova, Amazon Titan, Meta Llama, and Mistral model families. The server adapts request and response shapes for each provider family automatically.

## Architecture

```
┌──────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  React frontend  │──────▶│  Express server  │──────▶│  AWS Bedrock    │
│  (canvas, nodes) │       │  (stateless)     │       │  OpenAI         │
│                  │       │                  │       │  Anthropic      │
│  localStorage    │       │                  │       │  Tavily         │
└──────────────────┘       └──────────────────┘       └─────────────────┘
```

The server is a thin proxy. Its job is routing requests to the right provider, adapting request and response shapes across model families, and forwarding user-supplied credentials from request headers. It holds no state.

## Project layout

```
src/
  App.tsx                  Top-level shell
  components/
    Canvas.tsx             Infinite canvas, pan/zoom, node rendering
    ConversationNode.tsx   Individual chat node with collapse/expand
    MessageBubble.tsx      Single message, text-selection branching
    Minimap.tsx            Canvas overview
    CommandPalette.tsx     ⌘K menu
    Settings.tsx           API key configuration
    SupervisedCarousel.tsx Clarifying-question flow
    NodeInspector.tsx      Node metadata panel
  utils/
    storage.ts             localStorage-backed canvas persistence
    settings.ts            API key management
    apiFetch.ts            HTTP wrapper that forwards credentials
    tokens.ts              Token estimation
  constants/
    models.ts              Model catalog and routing prefixes
server/
  index.js                 Express proxy, multi-provider routing
docs/
  demo.mp4                 Walkthrough video
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on :3000 |
| `npm run server` | Express backend on :3001 |
| `npm run build` | Production build to `dist/` |
| `npm run test` | Run the Vitest suite |

## Contributing

Contributions are welcome. Whether you're fixing a bug, adding a provider, polishing the UI, or writing docs — there's room.

### Good first issues

- Add a new Bedrock provider family to `server/index.js` (look at `buildBedrockPayload` and `extractBedrockResponse` for the pattern)
- Improve the minimap rendering performance for large canvases
- Add export (Markdown, JSON) for a canvas
- Add keyboard shortcuts for branching without the mouse
- Add a "snapshot" feature that captures a canvas state you can revert to

### Development workflow

1. Fork the repo and create a branch: `git checkout -b feature/my-thing`
2. Install deps and run the dev stack: `npm install && npm run server` (then `npm run dev` in another terminal)
3. Make your changes
4. Run the tests: `npm run test`
5. Build to confirm there are no type errors: `npm run build`
6. Commit with a clear message (see below)
7. Open a pull request against `main`, describing what changed and why

### Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(canvas): add export to markdown
fix(server): handle empty Anthropic response
docs: clarify Bedrock IAM requirements
```

### Code style

- TypeScript strict mode is on — no `any` without justification
- Components are function components with hooks
- CSS lives next to the component it styles
- Prefer plain React state for local UI, localStorage for persistence; no global state library

### Filing issues

Good issues include:
- What you expected to happen
- What actually happened
- Minimal steps to reproduce
- Browser, OS, Node version
- Screenshots or a short recording if the bug is visual

### Questions and design discussions

Open a GitHub Discussion rather than an issue. Issues are for tracked work; discussions are for "should we do X?"

## License

[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](LICENSE). Free to use, modify, and share for non-commercial purposes with attribution. Commercial use is not permitted.
