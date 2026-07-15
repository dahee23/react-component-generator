import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

function makeComponent(overrides: Partial<GeneratedComponent> = {}): GeneratedComponent {
  return {
    id: '1',
    prompt: '버튼 만들어줘',
    code: 'const A = () => null;',
    createdAt: new Date('2026-07-15T10:00:00'),
    ...overrides,
  };
}

describe('ComponentCard - 스트리밍 상태', () => {
  it('스트리밍 중에는 코드 탭이 자동으로 활성화되고 미리보기 탭은 비활성화된다', () => {
    render(
      <ComponentCard
        component={makeComponent({ isStreaming: true, code: 'const A' })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    expect(screen.getByRole('button', { name: '코드' })).toHaveClass('tab--active');
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
  });

  it('스트리밍 중 미리보기 탭 클릭은 무시된다(비활성 상태 유지)', async () => {
    const user = userEvent.setup();
    render(
      <ComponentCard
        component={makeComponent({ isStreaming: true })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: '미리보기' }));
    expect(screen.getByRole('button', { name: '코드' })).toHaveClass('tab--active');
  });

  it('스트리밍이 완료되면(isStreaming: false) 미리보기 탭을 다시 자유롭게 쓸 수 있다', async () => {
    const user = userEvent.setup();
    render(
      <ComponentCard
        component={makeComponent({ isStreaming: false })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={false}
      />,
    );

    const previewTab = screen.getByRole('button', { name: '미리보기' });
    expect(previewTab).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '코드' }));
    expect(screen.getByRole('button', { name: '코드' })).toHaveClass('tab--active');

    await user.click(previewTab);
    expect(previewTab).toHaveClass('tab--active');
  });

  it('스트리밍 중에는 삭제/재생성/새로고침 버튼이 비활성화된다', () => {
    render(
      <ComponentCard
        component={makeComponent({ isStreaming: true })}
        onRemove={vi.fn()}
        onRegenerate={vi.fn()}
        isLoading={true}
      />,
    );

    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '미리보기 새로고침' })).toBeDisabled();
  });
});
