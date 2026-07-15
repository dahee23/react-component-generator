import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

const STORAGE_KEY = 'component-generator:history';

/** 테스트에서 임의 시점에 조각을 밀어넣을 수 있는 controllable ReadableStream을 만든다. */
function makeControllableStream() {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const encoder = new TextEncoder();

  return {
    stream,
    push: (chunk: string) => controllerRef.enqueue(encoder.encode(chunk)),
    close: () => controllerRef.close(),
  };
}

function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe('useComponentGenerator - 스트리밍', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delta 이벤트가 도착할 때마다 code가 점진적으로 채워지고, 완료 전까지는 localStorage에 반영되지 않는다', async () => {
    const { stream, push, close } = makeControllableStream();
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useComponentGenerator());

    let generatePromise: Promise<void>;
    act(() => {
      generatePromise = result.current.generate('버튼 만들어줘', undefined, 'anthropic');
    });

    await waitFor(() => expect(result.current.components).toHaveLength(1));
    expect(result.current.components[0].isStreaming).toBe(true);

    act(() => {
      push(sseData({ type: 'delta', text: 'const ' }));
    });
    await waitFor(() => expect(result.current.components[0].code).toBe('const '));

    // 스트리밍 도중에는 아직 localStorage에 반영되지 않아야 한다(빈 히스토리 상태 유지).
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(0);

    act(() => {
      push(sseData({ type: 'delta', text: 'A = () => null;' }));
    });
    await waitFor(() => expect(result.current.components[0].code).toBe('const A = () => null;'));

    act(() => {
      push(sseData({ type: 'done', code: 'const A = () => null;\n\nrender(<A />);' }));
      close();
    });

    await act(async () => {
      await generatePromise;
    });

    expect(result.current.components[0].code).toBe('const A = () => null;\n\nrender(<A />);');
    expect(result.current.components[0].isStreaming).toBeFalsy();

    // 완료된 뒤에는 localStorage에 최종 코드로 반영되어야 한다.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].code).toBe('const A = () => null;\n\nrender(<A />);');
  });

  it('스트림 도중 error 이벤트를 받으면 에러 상태가 되고 히스토리에는 추가되지 않는다', async () => {
    const { stream, push, close } = makeControllableStream();
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('버튼 만들어줘', undefined, 'anthropic');
    });

    await waitFor(() => expect(result.current.components).toHaveLength(1));

    act(() => {
      push(sseData({ type: 'delta', text: 'const ' }));
    });
    await waitFor(() => expect(result.current.components[0].code).toBe('const '));

    act(() => {
      push(sseData({ type: 'error', message: '업스트림 오류' }));
      close();
    });

    await waitFor(() => expect(result.current.error).toBe('업스트림 오류'));
    expect(result.current.components).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(0);
  });
});
