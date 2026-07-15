import { describe, it, expect } from 'vitest';
import { parseSSEBuffer, parseStreamEvent } from './sse';

describe('parseSSEBuffer', () => {
  it('완전한 이벤트들을 파싱하고 미완성 나머지를 remainder로 남긴다', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":3}';
    const { events, remainder } = parseSSEBuffer(buffer);

    expect(events.map((e) => e.data)).toEqual(['{"a":1}', '{"b":2}']);
    expect(remainder).toBe('data: {"c":3}');
  });

  it('빈 버퍼는 이벤트 없이 빈 remainder를 반환한다', () => {
    const { events, remainder } = parseSSEBuffer('');
    expect(events).toEqual([]);
    expect(remainder).toBe('');
  });
});

describe('parseStreamEvent', () => {
  it('delta 이벤트를 파싱한다', () => {
    const event = parseStreamEvent('{"type":"delta","text":"Hello"}');
    expect(event).toEqual({ type: 'delta', text: 'Hello' });
  });

  it('done 이벤트를 파싱한다', () => {
    const event = parseStreamEvent('{"type":"done","code":"const A = () => null;"}');
    expect(event).toEqual({ type: 'done', code: 'const A = () => null;' });
  });

  it('error 이벤트를 파싱한다', () => {
    const event = parseStreamEvent('{"type":"error","message":"API 오류"}');
    expect(event).toEqual({ type: 'error', message: 'API 오류' });
  });

  it('알 수 없는 타입이나 파싱 실패 시 null을 반환한다', () => {
    expect(parseStreamEvent('not-json')).toBeNull();
    expect(parseStreamEvent('{"type":"unknown"}')).toBeNull();
  });
});
