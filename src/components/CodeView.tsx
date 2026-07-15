import { useState } from 'react';

interface CodeViewProps {
  code: string;
  isStreaming?: boolean;
}

export function CodeView({ code, isStreaming = false }: CodeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-panel">
      <div className="panel-header">
        <h3>코드</h3>
        {isStreaming ? (
          <span className="streaming-badge">
            <span className="streaming-dot" aria-hidden="true" />
            실시간 생성 중
          </span>
        ) : (
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? '복사됨!' : '복사'}
          </button>
        )}
      </div>
      <pre className="code-block">
        <code>
          {code}
          {isStreaming && <span className="code-cursor" aria-hidden="true" />}
        </code>
      </pre>
    </div>
  );
}
