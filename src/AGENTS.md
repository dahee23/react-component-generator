## Module Context

React 19 + TypeScript frontend. Renders the prompt/settings UI and hosts `react-live`, which executes AI-generated component code directly in the browser.

## Tech Stack & Constraints

- Function components only, no class components.
- Styling is plain CSS with custom properties, not CSS-in-JS or CSS modules — `App.css` defines the theme tokens in `:root` (`--primary`, `--text`, `--line`, etc.) and `index.css` holds global resets/fonts. New components should consume these variables instead of hardcoding colors, so a palette change stays a one-file edit.
- All app state and API calls live in `src/hooks/useComponentGenerator.ts`; `App.tsx` stays a thin composition of components plus this hook. Don't add `fetch` calls or component-list state directly inside a presentational component — extend the hook instead.
- Shared types live in `src/types/index.ts` (`Provider`, `GeneratedComponent`). Add new cross-component types there rather than redeclaring inline in a component file.
- `src/lib/` holds pure, DOM/fetch-free helpers shared by the hook (e.g. `sse.ts` — parses the `/api/generate` SSE wire protocol). Keep new pure parsing/accumulation logic here, colocated with its test, rather than inlining it into the hook.

## Implementation Patterns

- One component per file, filename matches the exported component (`ComponentCard.tsx` exports `ComponentCard`).
- `LivePreview.tsx` wraps `react-live`'s `LiveProvider`/`LivePreview`/`LiveError`. This is the sandbox boundary for untrusted AI-generated code — it runs as real JS in the same browser context (no iframe isolation). Don't add `dangerouslySetInnerHTML` or `eval` elsewhere in the frontend; if you need to render AI output somewhere new, route it through this same `react-live` path rather than inventing a second execution path.
- `CodeView.tsx`'s copy-to-clipboard uses `navigator.clipboard.writeText` directly — no polyfill/fallback exists. If you add clipboard usage elsewhere, keep this dependency in mind (requires a secure context).
- **Streaming generation**: `useComponentGenerator.ts` reads `res.body` from `/api/generate` as a stream (via `src/lib/sse.ts`'s `parseSSEBuffer`/`parseStreamEvent`) and keeps the in-flight component in a separate `streamingComponent` state, distinct from the persisted `history` — it's merged into the `components` array returned to callers, but only `history` is written to `localStorage`/capped by `MAX_HISTORY`; the streaming item is committed to `history` only once the `done` event delivers the post-processed final code. `GeneratedComponent.isStreaming` flags the in-flight item. `ComponentCard.tsx` locks the tab to "코드" and disables the "미리보기" tab/remove/refresh/regenerate buttons while `isStreaming` is true (react-live must never see incomplete JS), switching back to "미리보기" and re-enabling everything once it flips to false.

## Testing Strategy

- `bun run test` (vitest, jsdom environment, see root `vite.config.ts`) or `bun run test:watch`.
- Test files are co-located: `PromptInput.tsx` + `PromptInput.test.tsx` in the same directory.
- Use `@testing-library/react` + `@testing-library/user-event`; query by role/label text (`getByRole('button', { name: '...' })`), not by CSS class or test-id. Korean UI strings are the actual accessible names — match them verbatim in tests.
- `src/test/setup.ts` runs `cleanup()` after each test automatically; don't add manual `afterEach(cleanup)` in individual test files.

## Local Golden Rules

- Don't hardcode hex colors in component-level CSS — add or reuse a `:root` variable in `App.css` so the theme stays centrally controlled.
- Don't introduce a second way to execute AI-generated code outside `LivePreview.tsx`'s `react-live` usage.
