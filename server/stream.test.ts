import { describe, it, expect } from 'vitest';
import { buildEventStream, mapErrorMessage, statusForError } from './stream';
import { extractAnthropicDeltaText } from './sse';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 주어진 원문 청크들을 순서대로 내보내는 가짜 업스트림 ReadableStream reader를 만든다. */
function fakeUpstreamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}

/** 실패하는 가짜 업스트림 reader 두 개 청크를 내보낸 뒤 에러를 던진다. */
function failingUpstreamReader(chunksBeforeFailure: string[]): ReadableStreamDefaultReader<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunksBeforeFailure.length) {
        controller.enqueue(encoder.encode(chunksBeforeFailure[i]));
        i += 1;
        return;
      }
      controller.error(new Error('네트워크 끊김'));
    },
  }).getReader();
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
  const reader = stream.getReader();
  let buffer = '';
  const results: Array<Record<string, unknown>> = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  for (const part of buffer.split('\n\n')) {
    if (!part.trim()) continue;
    const dataLine = part
      .split('\n')
      .find((line) => line.startsWith('data:'));
    if (dataLine) {
      results.push(JSON.parse(dataLine.slice('data:'.length).trim()));
    }
  }

  return results;
}

function anthropicDeltaChunk(text: string): string {
  return `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`;
}

describe('buildEventStream', () => {
  it('업스트림 delta를 원문 그대로 순서대로 흘려보낸다', async () => {
    const upstream = fakeUpstreamReader([anthropicDeltaChunk('const '), anthropicDeltaChunk('A = () => null;')]);

    const stream = buildEventStream(upstream, extractAnthropicDeltaText);
    const events = await readAll(stream);

    expect(events[0]).toEqual({ type: 'delta', text: 'const ' });
    expect(events[1]).toEqual({ type: 'delta', text: 'A = () => null;' });
  });

  it('스트림이 끝나면 누적된 전체 텍스트에 후처리를 적용한 done 이벤트를 마지막으로 보낸다', async () => {
    const upstream = fakeUpstreamReader([
      anthropicDeltaChunk('```jsx\n'),
      anthropicDeltaChunk('const Card = () => null;'),
      anthropicDeltaChunk('\n```'),
    ]);

    const stream = buildEventStream(upstream, extractAnthropicDeltaText);
    const events = await readAll(stream);

    const doneEvent = events.at(-1);
    expect(doneEvent?.type).toBe('done');
    // 코드펜스가 벗겨지고 render() 호출이 주입된 최종 코드여야 한다.
    expect(doneEvent?.code).toBe('const Card = () => null;\n\nrender(<Card />);');
  });

  it('청크가 SSE 이벤트 경계에서 잘려도 올바르게 재조립한다', async () => {
    const full = anthropicDeltaChunk('Hello');
    const splitPoint = Math.floor(full.length / 2);
    const upstream = fakeUpstreamReader([full.slice(0, splitPoint), full.slice(splitPoint)]);

    const stream = buildEventStream(upstream, extractAnthropicDeltaText);
    const events = await readAll(stream);

    expect(events).toEqual([
      { type: 'delta', text: 'Hello' },
      { type: 'done', code: 'Hello' },
    ]);
  });

  it('스트림 도중 업스트림이 실패하면 이미 보낸 delta 뒤에 error 이벤트를 보내고 스트림을 닫는다', async () => {
    const upstream = failingUpstreamReader([anthropicDeltaChunk('const ')]);

    const stream = buildEventStream(upstream, extractAnthropicDeltaText);
    const events = await readAll(stream);

    expect(events[0]).toEqual({ type: 'delta', text: 'const ' });
    expect(events.at(-1)?.type).toBe('error');
    expect(typeof events.at(-1)?.message).toBe('string');
  });
});

describe('mapErrorMessage', () => {
  it('503을 포함하면 과부하 안내 메시지로 변환한다', () => {
    expect(mapErrorMessage('Claude API error: 503')).toBe(
      'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
    );
  });

  it('429를 포함하면 요청 과다 안내 메시지로 변환한다', () => {
    expect(mapErrorMessage('Gemini API error: 429')).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  });

  it('그 외 메시지는 그대로 반환한다', () => {
    expect(mapErrorMessage('boom')).toBe('boom');
  });
});

describe('statusForError', () => {
  it('503/429는 각각의 상태 코드를, 그 외는 500을 반환한다', () => {
    expect(statusForError('x 503 y')).toBe(503);
    expect(statusForError('x 429 y')).toBe(429);
    expect(statusForError('boom')).toBe(500);
  });
});
