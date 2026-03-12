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

## Mandatory Pre-Work (MUST read before starting)

1. **Read `docs/PROJECT_CONTEXT.md`** — project status, architecture, current TODOs
2. **Read `docs/PITFALLS.md`** — known traps and their solutions
3. **Read `docs/DECISIONS.md`** — ADR history (why things are the way they are)

> ⚠️ Skipping these files is the #1 cause of repeated failures across agents.

## Deployment Rules

- **Before ANY Firebase/deployment task**, read: `knowledge/nongjong-project-portfolio/artifacts/patterns/firebase-billing-and-apphosting-traps.md`
- **Always run `firebase login:list`** to confirm which account is active
- **Always run `firebase projects:list`** to cross-verify project IDs
- **Check `apphosting.yaml`** project ID matches actual Firebase project

## Research & Knowledge Rules

- **Research/investigation tasks** MUST use NotebookLM (`nlm` CLI) to store fact-based sources
- **Never write reports from AI memory alone** — all claims must reference sourced data
- **`nlm source add <nb> --url "<URL>"`** for every URL discovered during research
- **AI-generated summaries are NOT valid NLM sources** — only original URLs/documents

## Port Management

- Check `port-registry.json` before starting any dev server
- Register your port, clean up old entries when changing ports

## Cross-Session Continuity

- Update `docs/PROJECT_CONTEXT.md` checkboxes when completing tasks
- Record architectural/technical decisions in `docs/DECISIONS.md`
- Log resolved pitfalls in `docs/PITFALLS.md` (cause + solution + prohibition)

## Known Pitfalls

- **Windows bash**: Pipes (`|`) and shell variables can hang. Use `head -c` instead of `head -n` when needed.
- **ESM imports**: Always use `.js` extension in import paths (TypeScript compiles `.ts` → `.js`)
- **Obsidian REST API**: Requires `OBSIDIAN_API_KEY` env var and Obsidian running locally
- **Ollama**: Optional dependency — gracefully handle when not running
- **Firebase project ID**: `apphosting.yaml` may have stale project ID — always cross-verify with `firebase projects:list`
- **Firebase auth**: Session expires — run `firebase login:list` first
