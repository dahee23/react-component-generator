import { useState, useCallback, useEffect } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { parseSSEBuffer, parseStreamEvent } from '../lib/sse';

const STORAGE_KEY = 'component-generator:history';
const MAX_HISTORY = 20;

/** localStorage에 저장된 히스토리를 불러온다. 접근 불가·손상된 데이터는 조용히 무시하고 빈 배열로 시작한다. */
function loadStoredComponents(): GeneratedComponent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is Omit<GeneratedComponent, 'createdAt'> & { createdAt: string } =>
          !!item &&
          typeof item.id === 'string' &&
          typeof item.prompt === 'string' &&
          typeof item.code === 'string' &&
          typeof item.createdAt === 'string',
      )
      .map((item) => ({ ...item, createdAt: new Date(item.createdAt) }))
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

/** 현재 히스토리를 localStorage에 반영한다. 프라이빗 브라우징 등으로 저장에 실패해도 앱 동작에는 영향을 주지 않는다. */
function persistComponents(components: GeneratedComponent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(components));
  } catch {
    // 저장 실패는 무시한다 — 히스토리가 이번 세션에만 유지될 뿐 생성 자체는 계속 동작해야 한다.
  }
}

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  // history: 완료되어 확정된 컴포넌트만 담는다 — 이 상태만 localStorage에 저장되고
  // MAX_HISTORY 개수 제한을 받는다.
  const [history, setHistory] = useState<GeneratedComponent[]>(loadStoredComponents);
  // streamingComponent: 현재 스트리밍 중인 컴포넌트(있다면 단 하나). 완료 전까지는
  // history/localStorage에 반영하지 않고, 화면에서만 실시간으로 code가 채워지는 걸 보여준다.
  const [streamingComponent, setStreamingComponent] = useState<GeneratedComponent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    persistComponents(history);
  }, [history]);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date();

    setStreamingComponent({ id, prompt, code: '', createdAt, isStreaming: true });

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      if (!res.body) {
        throw new Error('스트리밍 응답을 받지 못했습니다.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalCode: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSSEBuffer(buffer);
        buffer = remainder;

        for (const rawEvent of events) {
          const event = parseStreamEvent(rawEvent.data);
          if (!event) continue;

          if (event.type === 'delta') {
            setStreamingComponent((prev) =>
              prev && prev.id === id ? { ...prev, code: prev.code + event.text } : prev,
            );
          } else if (event.type === 'done') {
            finalCode = event.code;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }

      if (finalCode === null) {
        throw new Error('스트리밍이 완료되지 않았습니다.');
      }

      const newComponent: GeneratedComponent = { id, prompt, code: finalCode, createdAt };
      setHistory((prev) => [newComponent, ...prev].slice(0, MAX_HISTORY));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setStreamingComponent(null);
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setHistory((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
  }, []);

  const components = streamingComponent ? [streamingComponent, ...history] : history;

  return { components, isLoading, error, generate, removeComponent, clearAll };
}
