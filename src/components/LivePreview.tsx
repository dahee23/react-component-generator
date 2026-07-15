import { useState } from 'react';
import { LiveProvider, LivePreview as ReactLivePreview, LiveError } from 'react-live';

type Viewport = 'mobile' | 'tablet' | 'desktop';

const VIEWPORTS: { key: Viewport; label: string; width: number | string }[] = [
  { key: 'mobile', label: '모바일', width: 375 },
  { key: 'tablet', label: '태블릿', width: 768 },
  { key: 'desktop', label: '데스크탑', width: '100%' },
];

interface LivePreviewProps {
  code: string;
}

export function LivePreview({ code }: LivePreviewProps) {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const activeWidth = VIEWPORTS.find((v) => v.key === viewport)?.width;

  return (
    <div className="preview-panel">
      <div className="panel-header">
        <h3>미리보기</h3>
        <div className="viewport-toggle" role="group" aria-label="반응형 미리보기 크기 선택">
          {VIEWPORTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`viewport-btn ${viewport === key ? 'viewport-btn--active' : ''}`}
              onClick={() => setViewport(key)}
              aria-pressed={viewport === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="preview-content">
        <LiveProvider code={code} noInline>
          <div className="preview-render">
            <div
              className={`viewport-frame viewport-frame--${viewport}`}
              style={{ width: activeWidth }}
            >
              <ReactLivePreview />
            </div>
          </div>
          <LiveError className="preview-error" />
        </LiveProvider>
      </div>
    </div>
  );
}
