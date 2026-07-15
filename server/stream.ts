// 업스트림(Anthropic/Google) SSE reader를 소비해 클라이언트용 이벤트 스트림을
// 만드는 로직. fetch나 Bun.serve에 의존하지 않고 Web Streams API만 사용하므로,
// 가짜 ReadableStream을 주입해 네트워크 없이 단위 테스트할 수 있다.
// 실제 네트워크 호출(fetch)은 index.ts의 openAnthropicStream/openGoogleStream이 담당한다.

import { stripCodeFences, ensureRenderCall } from './generator';
import { parseSSEBuffer } from './sse';

export type DeltaExtractor = (data: string) => string | null;

/**
 * 업스트림 SSE reader를 소비하며 두 가지 일을 한다:
 * 1) 조각(delta)이 도착하는 즉시 원문 그대로 클라이언트로 흘려보낸다(실시간 표시용).
 * 2) 전체 텍스트를 누적했다가, 스트림이 끝나면 stripCodeFences/ensureRenderCall로
 *    후처리한 "완료" 코드를 별도의 done 이벤트로 전달한다 — 클라이언트는 이 code로만
 *    최종 컴포넌트를 확정해야 한다(중간 delta는 미완성 JS일 수 있어 react-live에 넘기면 안 됨).
 *
 * 업스트림 reader.read()가 이미 시작된 뒤 실패하면(네트워크 끊김 등) 클라이언트에는
 * 이미 문자가 전달된 상태라 다른 모델로 조용히 전환할 수 없다 — error 이벤트를 보내고
 * 스트림을 닫는다. 이는 의도된 트레이드오프다(index.ts 상단 주석 참고).
 */
export function buildEventStream(
  upstreamReader: ReadableStreamDefaultReader<Uint8Array>,
  extractDeltaText: DeltaExtractor,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sseBuffer = '';
      let fullText = '';

      const sendEvent = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        while (true) {
          const { value, done } = await upstreamReader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSSEBuffer(sseBuffer);
          sseBuffer = remainder;

          for (const event of events) {
            const text = extractDeltaText(event.data);
            if (text) {
              fullText += text;
              sendEvent({ type: 'delta', text });
            }
          }
        }

        const code = ensureRenderCall(stripCodeFences(fullText));
        sendEvent({ type: 'done', code });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendEvent({ type: 'error', message: mapErrorMessage(message) });
      } finally {
        controller.close();
      }
    },
  });
}

/** 503/429 등 알려진 실패를 한국어 사용자 메시지로 변환한다. 그 외는 원문 그대로 노출한다. */
export function mapErrorMessage(message: string): string {
  if (message.includes('503')) {
    return 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.';
  }
  if (message.includes('429')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }
  return message;
}

/** 스트림 시작 전(첫 바이트 전송 전) 실패에 대해 반환할 HTTP 상태 코드를 정한다. */
export function statusForError(message: string): number {
  if (message.includes('503')) return 503;
  if (message.includes('429')) return 429;
  return 500;
}
