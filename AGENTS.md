## Operational Commands

- Package manager: `bun` only. Never use `npm`, `yarn`, `pnpm` — `bun.lock` is the single source of truth.
- `bun install` — install dependencies
- `bun run dev` — runs API server (`server/index.ts`, port 3002) and Vite (port 5173) concurrently. Vite proxies `/api/*` to the API server (see `vite.config.ts`).
- `bun run server` — API server only, with `--watch`
- `bun run build` — `tsc -b && vite build`
- `bun run lint` — ESLint over the whole repo
- `bun run test` — vitest run (covers `src/**/*.test.{ts,tsx}` and `server/**/*.test.ts`)
- `bun run test:watch` — vitest watch mode

## Golden Rules

- **Never hardcode API keys.** Anthropic/Google keys come from `.env` (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) or a client-supplied key; see `server/AGENTS.md` for the resolution order.
- **Never commit `.env`.** Only `.env.example` (empty placeholders) is tracked.
- **Test files are co-located** with the code they cover (`foo.ts` + `foo.test.ts` in the same directory), not in a separate `__tests__/` tree. Follow this in both `server/` and `src/`.
- **Commit convention:** Korean commit messages, `<type>: <summary>` where type is one of `feat/fix/refactor/chore/docs/test/style`. The `commit` skill (`.claude/skills/commit/`) automates this — prefer invoking it over writing raw `git commit` commands.
- **Maintenance policy:** if you notice this file describing a command, path, or rule that no longer matches the code, fix the file in the same change rather than leaving the drift.

## Project Context

Prompt-to-React-component generator: user enters a prompt, an AI provider (Anthropic Claude or Google Gemini) generates a self-contained component, and it renders live via `react-live`. See `README.md` for setup and feature overview — not duplicated here.

Tech stack: React 19, TypeScript, Vite, Bun (server runtime), react-live, Vitest + Testing Library.

## Standards & References

- ESLint config: `eslint.config.js` (flat config, `typescript-eslint` + `react-hooks` + `react-refresh`).
- TypeScript: project-referenced (`tsconfig.json` → `tsconfig.app.json` / `tsconfig.node.json`). Run `tsc -b` (part of `bun run build`) to check types across both.
- No CONTRIBUTING.md or docs/ exist yet — if you add substantial conventions, prefer extending this file (or the relevant nested one) over creating a new doc.

## Context Map

- **[Backend / AI provider integration](./server/AGENTS.md)** — editing `server/*.ts`, provider prompts, API key handling, or model fallback logic.
- **[Frontend / React components](./src/AGENTS.md)** — editing `src/**`, component styling, or the CSS variable system.
