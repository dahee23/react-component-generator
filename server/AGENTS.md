## Module Context

Bun-native HTTP server (`Bun.serve`, no Express/Fastify) that proxies component-generation requests to Anthropic or Google, normalizes the AI response into renderable code, and serves it to the frontend. No separate `package.json` — dependencies come from the root.

## Tech Stack & Constraints

- `Bun.serve` only — do not introduce Express, Hono, or another HTTP framework here.
- Raw `fetch` calls to `https://api.anthropic.com` and `https://generativelanguage.googleapis.com` — no provider SDKs are installed. If you add a provider, follow the existing raw-`fetch` pattern rather than adding an SDK dependency, unless the user asks otherwise.
- `generator.ts`, `fallback.ts`, `sse.ts`, and `stream.ts` are pure/side-effect-free (no `Bun.serve`, no `fetch`) — this is intentional so they stay unit-testable without a running server. `sse.ts` parses raw SSE text into events and extracts provider-specific delta text; `stream.ts`'s `buildEventStream` consumes a `ReadableStreamDefaultReader<Uint8Array>` (real or fake) and produces the client-facing SSE stream — tests construct fake upstream `ReadableStream`s instead of hitting the network. Keep new pure logic in one of these files, not inline in `index.ts`.

## Implementation Patterns

- **CORS**: `CORS_HEADERS` in `index.ts` must be attached to every `Response`, including error paths (400/404/500/503/429). Missing it on a new route breaks the frontend silently (browser blocks the response, not the server).
- **API key resolution** (`resolveApiKey`): client-supplied key always wins over the server's `.env` key (`clientKey || ENV_KEYS[provider] || null`). Don't invert this — the UI's "override with my own key" flow depends on it.
- **SYSTEM_PROMPT contract** (`index.ts`): generated code must be import-free, TypeScript-free, self-contained, and end with a `render(<Component />)` call. This is a hard contract with `generator.ts`:
  - `ensureRenderCall` only injects a `render()` call if it can regex-match a `const Name` or `function Name` declaration starting with an uppercase letter. If you change the prompt's expected output shape, verify this regex still matches.
  - `stripCodeFences` assumes the model may wrap output in ` ```jsx/tsx/javascript/typescript ` fences. If a new provider uses a different fence convention, extend this function rather than special-casing providers elsewhere.
- **Model fallback** (`fallback.ts` → `withModelFallback`): tries an ordered list of models, returns the first success, throws the last error if all fail. `GOOGLE_MODELS` in `index.ts` is the priority order — the currently preferred model is first. When adding/reordering models, this array is the only place to change.
- **Streaming** (`/api/generate`): both providers stream via SSE — Anthropic with `stream: true` in the request body, Google via the `:streamGenerateContent?alt=sse` endpoint. `index.ts`'s `openAnthropicStream`/`openGoogleStream` open the upstream `ReadableStreamDefaultReader` (this is the only point where a Google model fallback can still happen — before any byte reaches the client); `stream.ts`'s `buildEventStream` then pumps that reader and re-emits our own wire protocol to the client: `data: {"type":"delta","text":...}` per raw chunk (for live display), followed by a single `data: {"type":"done","code":...}` once the upstream closes, with `stripCodeFences`/`ensureRenderCall` applied only to that final accumulated text — never to individual deltas, since they're often incomplete JS. If the upstream fails *after* the client stream has started, there's no way to fall back to another model (bytes are already committed to the response) — `buildEventStream` sends `data: {"type":"error","message":...}` and closes instead. Keep this trade-off in mind if you touch the streaming path.
- **Provider error mapping**: `stream.ts`'s `mapErrorMessage`/`statusForError` match on `message.includes('503')` / `'429'` to produce Korean user-facing error strings and HTTP status codes. This is string-matching, not typed errors — if you add a new failure mode, follow the same `if (message.includes(...))` pattern for consistency rather than introducing a different error-handling mechanism.

## Testing Strategy

- `bun run test` (vitest) covers `server/**/*.test.ts`.
- Test files are co-located: `generator.ts` + `generator.test.ts`, `fallback.ts` + `fallback.test.ts`, `sse.ts` + `sse.test.ts`, `stream.ts` + `stream.test.ts`.
- Because `generator.ts`/`fallback.ts`/`sse.ts`/`stream.ts` are pure, tests call them directly with no mocking of `Bun.serve` or `fetch` — `stream.test.ts` builds fake `ReadableStream`s (including ones that fail mid-stream) to exercise `buildEventStream` without a network call. Keep new server-side logic pure and colocate its test the same way rather than adding integration tests against the running server.
- `index.ts` itself (the `Bun.serve` handler) has no test file by design (starting it as an import side effect would break the pure-module testing story above). Its streaming/CORS/error-status wiring is verified manually / via the frontend's e2e checks instead.

## Local Golden Rules

- Never log or echo a resolved API key (client or env) in a response body or console output.
- Don't add a new HTTP route without adding its headers to `CORS_HEADERS` handling and a corresponding entry in the `url.pathname` dispatch in `index.ts`'s `fetch` handler.
