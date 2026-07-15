import { describe, it, expect } from 'vitest';
import { parseSSEBuffer, extractAnthropicDeltaText, extractGoogleDeltaText } from './sse';

describe('parseSSEBuffer', () => {
  it('완전한 이벤트 하나를 파싱하고 남은 버퍼는 비운다', () => {
    const buffer = 'event: message\ndata: {"a":1}\n\n';
    const { events, remainder } = parseSSEBuffer(buffer);

    expect(events).toEqual([{ event: 'message', data: '{"a":1}' }]);
    expect(remainder).toBe('');
  });

  it('event 필드가 없어도 data만으로 이벤트를 만든다', () => {
    const buffer = 'data: {"a":1}\n\n';
    const { events } = parseSSEBuffer(buffer);

    expect(events).toEqual([{ event: undefined, data: '{"a":1}' }]);
  });

  it('아직 끝나지 않은(빈 줄로 안 끝난) 부분은 remainder로 남긴다', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}';
    const { events, remainder } = parseSSEBuffer(buffer);

    expect(events).toEqual([{ event: undefined, data: '{"a":1}' }]);
    expect(remainder).toBe('data: {"b":2}');
  });

  it('여러 완전한 이벤트를 순서대로 파싱한다', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\n';
    const { events, remainder } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('{"a":1}');
    expect(events[1].data).toBe('{"b":2}');
    expect(remainder).toBe('');
  });

  it('여러 줄의 data: 라인은 개행으로 합쳐진다', () => {
    const buffer = 'data: line1\ndata: line2\n\n';
    const { events } = parseSSEBuffer(buffer);

    expect(events).toEqual([{ event: undefined, data: 'line1\nline2' }]);
  });

  it('빈 버퍼는 이벤트 없이 빈 remainder를 반환한다', () => {
    const { events, remainder } = parseSSEBuffer('');
    expect(events).toEqual([]);
    expect(remainder).toBe('');
  });
});

describe('extractAnthropicDeltaText', () => {
  it('content_block_delta / text_delta 이벤트에서 텍스트를 추출한다', () => {
    const data = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' },
    });
    expect(extractAnthropicDeltaText(data)).toBe('Hello');
  });

  it('다른 타입의 이벤트는 null을 반환한다', () => {
    const data = JSON.stringify({ type: 'message_start' });
    expect(extractAnthropicDeltaText(data)).toBeNull();
  });

  it('JSON 파싱에 실패하면 null을 반환한다', () => {
    expect(extractAnthropicDeltaText('not-json')).toBeNull();
  });

  it('[DONE] 같은 비-JSON 종료 마커도 null을 반환한다', () => {
    expect(extractAnthropicDeltaText('[DONE]')).toBeNull();
  });
});

describe('extractGoogleDeltaText', () => {
  it('candidates[0].content.parts에서 텍스트를 이어붙인다', () => {
    const data = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Hel' }, { text: 'lo' }] } }],
    });
    expect(extractGoogleDeltaText(data)).toBe('Hello');
  });

  it('parts가 없으면 빈 문자열을 반환한다', () => {
    const data = JSON.stringify({ candidates: [{ content: {} }] });
    expect(extractGoogleDeltaText(data)).toBe('');
  });

  it('candidates가 없으면 빈 문자열을 반환한다', () => {
    expect(extractGoogleDeltaText(JSON.stringify({}))).toBe('');
  });

  it('JSON 파싱에 실패하면 빈 문자열을 반환한다', () => {
    expect(extractGoogleDeltaText('not-json')).toBe('');
  });
});
