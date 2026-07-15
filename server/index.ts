import { withModelFallback } from './fallback';
import { extractAnthropicDeltaText, extractGoogleDeltaText } from './sse';
import { buildEventStream, mapErrorMessage, statusForError } from './stream';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Responsive layout rules (the preview renders the component at different container widths, e.g. 375px/768px/full — the component must adapt to whatever width it's given, it does not control the width of its own container):
- The root element must use width: '100%' and boxSizing: 'border-box' instead of a fixed pixel width, with maxWidth only as an optional upper cap
- Never use vw/vh units — the preview container's width is independent of the actual browser viewport, so these units will not reflect the intended size
- Any multi-column layout (card grids, KPI rows, form fields side by side, etc.) must use flexWrap: 'wrap' on a flex container, or CSS Grid with gridTemplateColumns: 'repeat(auto-fit, minmax(<Npx>, 1fr))', so columns stack vertically when the container is narrow
- Use relative padding/gaps (percentages or small fixed values) rather than large fixed pixel margins that would overwhelm a narrow container

Example output format:
const StatsPanel = () => {
  const [hovered, setHovered] = React.useState(null);
  const stats = [
    { label: 'Revenue', value: '$48.2k' },
    { label: 'Active Users', value: '2,481' },
    { label: 'Conversion', value: '3.8%' },
  ];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '640px',
        boxSizing: 'border-box',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px',
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          onMouseEnter={() => setHovered(stat.label)}
          onMouseLeave={() => setHovered(null)}
          style={{
            flex: '1 1 160px',
            boxSizing: 'border-box',
            padding: '20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            boxShadow: hovered === stat.label ? '0 12px 24px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.12)',
            transition: 'box-shadow 0.2s ease',
          }}
        >
          <div style={{ fontSize: '13px', opacity: 0.85 }}>{stat.label}</div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
};

render(<StatsPanel />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

/**
 * 업스트림(Anthropic/Google) 스트리밍 응답의 body reader를 여는 함수들.
 * 첫 바이트를 클라이언트로 흘려보내기 전 단계이므로, 여기서 던진 에러는
 * (Google의 경우) 모델 폴백으로 이어지거나 /api/generate 핸들러에서 평범한
 * JSON 에러 응답으로 변환된다. 스트림을 열고 난 뒤(reader 획득 후) 발생하는
 * 에러는 이미 클라이언트에 응답이 시작된 상태라 폴백이 불가능하다 —
 * buildEventStream이 SSE "error" 이벤트로 처리한다.
 */
async function openAnthropicStream(prompt: string, apiKey: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Claude API가 스트리밍 응답 바디를 반환하지 않았습니다.');
  }

  return response.body.getReader();
}

async function openGoogleModelStream(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Gemini API가 스트리밍 응답 바디를 반환하지 않았습니다.');
  }

  return response.body.getReader();
}

async function openGoogleStream(prompt: string, apiKey: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  // 폴백은 아직 어떤 바이트도 클라이언트로 보내지 않은 상태(reader를 얻기 전)에서만
  // 동작한다. withModelFallback은 각 모델에 대해 openGoogleModelStream을 호출하는데,
  // 이 함수가 던지는 에러는 response.ok가 false이거나 body가 없을 때만 발생하므로
  // "스트리밍 시작 전 실패"라는 전제를 만족한다.
  return withModelFallback(GOOGLE_MODELS, (model) => openGoogleModelStream(prompt, apiKey, model));
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        // 업스트림 reader를 여는 단계까지는 아직 클라이언트에 한 바이트도 나가지
        // 않은 상태다 — 여기서 던지는 에러는 (Google이면 모델 폴백을 거친 뒤) 아래
        // catch에서 평범한 JSON 에러 응답으로 변환된다. reader를 연 다음부터는
        // buildEventStream이 스트림 내부에서 에러를 처리한다(폴백 불가, SSE error 이벤트로 통지).
        const upstreamReader =
          provider === 'google'
            ? await openGoogleStream(prompt, resolvedKey)
            : await openAnthropicStream(prompt, resolvedKey);

        const extractDeltaText = provider === 'google' ? extractGoogleDeltaText : extractAnthropicDeltaText;

        const eventStream = buildEventStream(upstreamReader, extractDeltaText);

        return new Response(eventStream, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        return Response.json(
          { error: mapErrorMessage(message) },
          { status: statusForError(message), headers: CORS_HEADERS }
        );
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
