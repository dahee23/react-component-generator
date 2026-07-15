// `/api/generate` 스트리밍 응답(SSE)을 파싱하는 순수 함수들.
// fetch나 DOM에 의존하지 않아 단위 테스트가 가능하다.

export interface ParsedSSEEvent {
  data: string;
}

export interface ParseSSEBufferResult {
  events: ParsedSSEEvent[];
  remainder: string;
}

/**
 * 누적된 SSE 원문 버퍼를 완전한 이벤트들과, 아직 끝나지 않은 나머지로 분리한다.
 * 나머지는 다음에 도착한 청크와 합쳐 다시 파싱해야 한다.
 */
export function parseSSEBuffer(buffer: string): ParseSSEBufferResult {
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  const events: ParsedSSEEvent[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;

    const dataLines = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim());

    if (dataLines.length > 0) {
      events.push({ data: dataLines.join('\n') });
    }
  }

  return { events, remainder };
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; message: string };

/** 서버가 보내는 커스텀 이벤트 payload(JSON 문자열)를 StreamEvent로 파싱한다. */
export function parseStreamEvent(data: string): StreamEvent | null {
  try {
    const json = JSON.parse(data) as Record<string, unknown>;

    if (json.type === 'delta' && typeof json.text === 'string') {
      return { type: 'delta', text: json.text };
    }
    if (json.type === 'done' && typeof json.code === 'string') {
      return { type: 'done', code: json.code };
    }
    if (json.type === 'error' && typeof json.message === 'string') {
      return { type: 'error', message: json.message };
    }
    return null;
  } catch {
    return null;
  }
}
