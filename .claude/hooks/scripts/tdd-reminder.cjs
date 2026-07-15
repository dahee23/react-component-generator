let data = '';
process.stdin.on('data', (chunk) => {
  data += chunk;
});
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath =
      (input.tool_input && input.tool_input.file_path) ||
      (input.tool_response && input.tool_response.filePath) ||
      '';

    if (!/\.tsx?$/.test(filePath)) return;

    const message =
      'TDD 리마인더 — RED(실패 테스트 먼저 작성·실행해 실패 확인) → GREEN(최소 구현) → REFACTOR 순서를 ' +
      '지켰나요? 테스트보다 프로덕션 코드를 먼저 썼다면 "참고용"으로 남기지 말고 삭제한 뒤 RED부터 다시 ' +
      '시작하세요. 타입 정의·설정 파일·순수 UI처럼 TDD 예외 대상이면 무시해도 됩니다. ' +
      '기준: ~/.claude/rules/tdd.md';

    process.stdout.write(
      JSON.stringify({
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: message,
        },
      }),
    );
  } catch {
    // 입력 파싱 실패 시 조용히 무시한다 — 리마인더 훅이 세션을 막아서는 안 된다.
  }
});
