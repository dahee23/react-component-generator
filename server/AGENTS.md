## Module Context

Bun-native HTTP server (`Bun.serve`, no Express/Fastify) that proxies component-generation requests to Anthropic or Google, normalizes the AI response into renderable code, and serves it to the frontend. No separate `package.json` — dependencies come from the root.

## Tech Stack & Constraints

- `Bun.serve` only — do not introduce Express, Hono, or another HTTP framework here.
- Raw `fetch` calls to `https://api.anthropic.com` and `https://generativelanguage.googleapis.com` — no provider SDKs are installed. If you add a provider, follow the existing raw-`fetch` pattern rather than adding an SDK dependency, unless the user asks otherwise.
- `generator.ts` and `fallback.ts` are pure functions with no side effects (no `Bun.serve`, no `fetch`) — this is intentional so they stay unit-testable without a running server. Keep new pure logic there, not inline in `index.ts`.

## Implementation Patterns

- **CORS**: `CORS_HEADERS` in `index.ts` must be attached to every `Response`, including error paths (400/404/500/503/429). Missing it on a new route breaks the frontend silently (browser blocks the response, not the server).
- **API key resolution** (`resolveApiKey`): client-supplied key always wins over the server's `.env` key (`clientKey || ENV_KEYS[provider] || null`). Don't invert this — the UI's "override with my own key" flow depends on it.
- **SYSTEM_PROMPT contract** (`index.ts`): generated code must be import-free, TypeScript-free, self-contained, and end with a `render(<Component />)` call. This is a hard contract with `generator.ts`:
  - `ensureRenderCall` only injects a `render()` call if it can regex-match a `const Name` or `function Name` declaration starting with an uppercase letter. If you change the prompt's expected output shape, verify this regex still matches.
  - `stripCodeFences` assumes the model may wrap output in ` ```jsx/tsx/javascript/typescript ` fences. If a new provider uses a different fence convention, extend this function rather than special-casing providers elsewhere.
- **Model fallback** (`fallback.ts` → `withModelFallback`): tries an ordered list of models, returns the first success, throws the last error if all fail. `GOOGLE_MODELS` in `index.ts` is the priority order — the currently preferred model is first. When adding/reordering models, this array is the only place to change.
- **Provider error mapping**: `index.ts` matches on `message.includes('503')` / `'429'` to produce Korean user-facing error strings. This is string-matching, not typed errors — if you add a new failure mode, follow the same `if (message.includes(...))` pattern for consistency rather than introducing a different error-handling mechanism.

## Testing Strategy

- `bun run test` (vitest) covers `server/**/*.test.ts`.
- Test files are co-located: `generator.ts` + `generator.test.ts`, `fallback.ts` + `fallback.test.ts`.
- Because `generator.ts`/`fallback.ts` are pure, tests call them directly with no mocking of `Bun.serve` or `fetch`. Keep new server-side logic pure and colocate its test the same way rather than adding integration tests against the running server.

## Local Golden Rules

- Never log or echo a resolved API key (client or env) in a response body or console output.
- Don't add a new HTTP route without adding its headers to `CORS_HEADERS` handling and a corresponding entry in the `url.pathname` dispatch in `index.ts`'s `fetch` handler.
