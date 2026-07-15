// 업스트림(Anthropic/Google) SSE 응답을 파싱하는 순수 함수들.
// 부수효과(fetch, Bun.serve 등)가 없어 단위 테스트가 가능하다.

export interface ParsedSSEEvent {
  event?: string;
  data: string;
}

export interface ParseSSEBufferResult {
  events: ParsedSSEEvent[];
  remainder: string;
}

/**
 * 누적된 SSE 원문 버퍼를 파싱해 완전한 이벤트 목록과, 아직 끝나지 않은(빈 줄로
 * 종료되지 않은) 나머지 텍스트를 분리한다. 나머지 텍스트는 다음 청크와 합쳐
 * 다시 파싱해야 한다 — 네트워크 청크 경계가 이벤트 경계와 일치한다는 보장이 없다.
 */
export function parseSSEBuffer(buffer: string): ParseSSEBufferResult {
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  const events: ParsedSSEEvent[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;

    let eventName: string | undefined;
    const dataLines: string[] = [];

    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }

  return { events, remainder };
}

/**
 * Anthropic 스트리밍 이벤트(`content_block_delta` / `text_delta`)에서 텍스트
 * 조각을 추출한다. 다른 이벤트 타입(message_start 등)이거나 JSON 파싱에
 * 실패하면(예: `[DONE]` 같은 비-JSON 마커) null을 반환한다.
 */
export function extractAnthropicDeltaText(data: string): string | null {
  try {
    const json = JSON.parse(data) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
      return typeof json.delta.text === 'string' ? json.delta.text : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Google `streamGenerateContent?alt=sse` 이벤트에서 텍스트 조각을 추출한다.
 * `candidates[0].content.parts[].text`를 이어붙이며, 형태가 예상과 다르거나
 * JSON 파싱에 실패하면 빈 문자열을 반환한다.
 */
export function extractGoogleDeltaText(data: string): string {
  try {
    const json = JSON.parse(data) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const parts = json?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  } catch {
    return '';
  }
}
