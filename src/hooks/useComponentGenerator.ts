import { useState, useCallback, useEffect } from 'react';
import type { GeneratedComponent, Provider } from '../types';

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
  const [components, setComponents] = useState<GeneratedComponent[]>(loadStoredComponents);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    persistComponents(components);
  }, [components]);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate component');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: data.code,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev].slice(0, MAX_HISTORY));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, isLoading, error, generate, removeComponent, clearAll };
}
