// AI 응답 텍스트를 react-live에서 실행 가능한 코드로 정규화하는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

/** 응답에 섞여 나온 마크다운 코드펜스(```)를 제거한다. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:jsx|tsx|javascript|typescript)?\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

/**
 * react-live(noInline)는 `render(...)` 호출이 있어야 미리보기를 그린다.
 * 응답에 render 호출이 없으면 컴포넌트 선언을 찾아 자동으로 주입한다.
 *
 * 마지막으로 매칭되는 선언을 사용한다 — 헬퍼 상수(예: `const MAX_ITEMS = 5;`)도
 * 대문자로 시작하면 정규식에 매칭되지만, 실제 컴포넌트는 관례상 그런 헬퍼들
 * 다음에 마지막으로 선언되므로 이쪽이 첫 매치보다 정확도가 높다.
 */
export function ensureRenderCall(code: string): string {
  if (/\brender\s*\(/.test(code)) return code;

  const matches = [...code.matchAll(/(?:const|function)\s+([A-Z]\w+)/g)];
  const lastMatch = matches.at(-1);
  if (lastMatch) {
    return `${code}\n\nrender(<${lastMatch[1]} />);`;
  }
  return code;
}
