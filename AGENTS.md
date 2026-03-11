# AGENTS.md — Cross-Tool Project Rules

> This file is read by Antigravity, Cursor, Claude Code, GitHub Copilot, and Codex.
> Keep it concise — only non-inferable rules that prevent recurring mistakes.

## Project Overview

- **Name**: nyongjong-agent (뇽죵이 Agent)
- **Purpose**: Autonomous AI agent MCP server for Antigravity IDE
- **Runtime**: Node.js ≥22, TypeScript, ESM (type: module)
- **Protocol**: Model Context Protocol (stdio transport)

## Build & Test (MUST run before any commit)

```bash
npx tsc --noEmit          # Type check — 0 errors required
npm test                  # vitest — all tests must pass
npm run build             # esbuild bundle
```

> ⚠️ Build passing ≠ Tests passing. Both are separate gates.

## Code Style

- **Language**: TypeScript strict mode, ESM imports only
- **Comments**: English
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Indentation**: 2 spaces

## File Structure Rules

- Source code: `src/` — organized by domain (core, personas, workflow, stitch, etc.)
- Tests: `tests/` — mirror `src/` structure (e.g., `tests/core/`, `tests/personas/`)
- Test files: `*.test.ts` suffix
- MCP tool registration: `src/mcp-server.ts` only
- Shared state: `src/core/shared-state.ts` — singleton pattern

## Safety Rules

- **No hardcoded API keys** — use environment variables from `.env`
- **No `rm -rf`** without explicit user approval
- **No `npm publish`** without explicit user approval
- **No destructive database operations** without explicit user approval
- **Pre-commit hook** (`.git/hooks/pre-commit`) enforces tsc + secret detection

## Testing Rules

- All new features require tests in `tests/` directory
- Test framework: vitest
- Mock external dependencies (Obsidian API, Ollama, OpenAI)
- Do NOT call real external APIs in tests

## MCP Tool Registration Pattern

```typescript
// In src/mcp-server.ts
server.tool('tool_name', 'Description', { /* zod schema */ }, async (params) => {
  // Implementation
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

## Known Pitfalls

- **Windows bash**: Pipes (`|`) and shell variables can hang. Use `head -c` instead of `head -n` when needed.
- **ESM imports**: Always use `.js` extension in import paths (TypeScript compiles `.ts` → `.js`)
- **Obsidian REST API**: Requires `OBSIDIAN_API_KEY` env var and Obsidian running locally
- **Ollama**: Optional dependency — gracefully handle when not running
