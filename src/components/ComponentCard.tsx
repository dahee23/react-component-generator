import { useState } from 'react';
import type { GeneratedComponent } from '../types';
import { LivePreview } from './LivePreview';
import { CodeView } from './CodeView';

interface ComponentCardProps {
  component: GeneratedComponent;
  onRemove: (id: string) => void;
  onRegenerate: (prompt: string) => void;
  isLoading: boolean;
}

type Tab = 'preview' | 'code';

export function ComponentCard({ component, onRemove, onRegenerate, isLoading }: ComponentCardProps) {
  const isStreaming = !!component.isStreaming;
  const [activeTab, setActiveTab] = useState<Tab>(isStreaming ? 'code' : 'preview');
  const [previewKey, setPreviewKey] = useState(0);
  // isStreaming 전환을 렌더링 중에 감지해 activeTab을 맞춰준다(React가 권장하는
  // "prop 변화에 맞춰 state 조정하기" 패턴 — useEffect에서 setState하면 불필요한
  // 추가 렌더/깜빡임이 생기므로 렌더 중에 바로 처리한다).
  const [prevIsStreaming, setPrevIsStreaming] = useState(isStreaming);
  if (isStreaming !== prevIsStreaming) {
    setPrevIsStreaming(isStreaming);
    // 스트리밍 중에는 미완성 코드를 react-live에 넘기면 안 되므로 코드 탭에 고정하고,
    // 스트리밍이 끝나면 완성된 결과를 바로 볼 수 있도록 미리보기로 전환한다.
    setActiveTab(isStreaming ? 'code' : 'preview');
  }

  const createdAt = component.createdAt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="component-card">
      <div className="card-header">
        <div className="card-title-group">
          <span>{createdAt}</span>
          <p className="card-prompt">{component.prompt}</p>
        </div>
        <div className="card-actions">
          {isStreaming && (
            <span className="streaming-badge">
              <span className="streaming-dot" aria-hidden="true" />
              생성 중
            </span>
          )}
          <button
            className="btn-refresh"
            onClick={() => setPreviewKey((k) => k + 1)}
            title="미리보기 새로고침"
            aria-label="미리보기 새로고침"
            disabled={isStreaming}
          >
            ↻
          </button>
          <button
            className="btn-regenerate"
            onClick={() => onRegenerate(component.prompt)}
            disabled={isLoading || isStreaming}
          >
            {isLoading ? '생성 중...' : '재생성'}
          </button>
          <button
            className="btn-remove"
            onClick={() => onRemove(component.id)}
            disabled={isStreaming}
          >
            삭제
          </button>
        </div>
      </div>
      <div className="card-tabs">
        <button
          className={`tab ${activeTab === 'preview' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('preview')}
          disabled={isStreaming}
        >
          미리보기
        </button>
        <button
          className={`tab ${activeTab === 'code' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          코드
        </button>
      </div>
      <div className="card-content">
        <div className={activeTab === 'preview' ? undefined : 'tab-panel--hidden'}>
          {!isStreaming && <LivePreview key={previewKey} code={component.code} />}
        </div>
        <div className={activeTab === 'code' ? undefined : 'tab-panel--hidden'}>
          <CodeView code={component.code} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}
