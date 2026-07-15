---
name: create-pr
description: |
  현재 브랜치의 커밋과 base 브랜치 대비 diff를 분석해 GitHub PR을 생성한다. 제목과 본문
  (references/template.md 템플릿 기반)을 작성하고, 사용자 승인 후 push와 `gh pr create`를 실행한다.
  "PR 만들어줘", "PR 생성해줘", "풀리퀘 올려줘", "create a PR", "open a pull request" 같은 요청에
  활성화한다.
context: fork
agent: general-purpose
allowed-tools: [Bash, Read, Glob, Grep]
---

# create-pr: GitHub PR 생성

현재 브랜치의 커밋 이력과 diff를 근거로 PR 제목·본문을 작성하고, **사용자 승인 후** push 및
`gh pr create`를 실행한다. 승인 없이 임의로 push하거나 PR을 만들지 않는다.

`context: fork`로 동작하므로 이 스킬이 트리거되면 격리된 서브에이전트에서 실행되고, 완료 후 PR URL과
요약만 메인 대화로 반환된다.

## 필요한 도구

**외부 CLI 의존성** (Bash로 실행, 스킬 시작 시 확인):
- `git` — 브랜치·커밋·diff 확인 및 push
- `gh` (GitHub CLI) — PR 생성. `gh auth status`로 인증 여부를 먼저 확인한다. 인증되어 있지 않거나
  `gh`/`git`이 설치되어 있지 않으면 설치·로그인 방법을 안내하고 **여기서 중단한다**(자동 설치 시도 금지).

**Claude Code 도구 권한** (frontmatter `allowed-tools`로 고정):
- `Bash` — git/gh 명령 실행
- `Read` — `references/template.md`, diff 결과 파일 등 확인
- `Glob` / `Grep` — 관련 파일·컨벤션 탐색

`Edit`/`Write`는 의도적으로 포함하지 않는다. 이 스킬은 **코드를 수정하지 않는다** — PR 생성 도중 코드
수정이 필요하다고 판단되면 범위 밖이므로 사용자에게 알리고 중단한다.

## 워크플로우

### Step 0: 저장소 지침 로드

저장소 루트의 `AGENTS.md`(없으면 `CLAUDE.md`)를 읽어 커밋 컨벤션·PR 관련 지침이 있으면 따른다.

### Step 1: 사전 상태 확인

- `git branch --show-current`로 현재 브랜치 확인. base 브랜치(main/master 등)에 그대로 있으면 PR을
  만들 feature 브랜치가 없다는 뜻이므로 사용자에게 알리고 중단한다.
- `git status`로 미커밋 변경사항 확인. 있으면 그 사실을 알리고, 커밋 후 다시 실행하도록 안내한다
  (`commit` 스킬 사용을 제안한다). 임의로 커밋하지 않는다.
- base 브랜치 대비 커밋이 0개면(`git log --oneline <base>..HEAD`가 비어 있으면) PR을 만들 내용이
  없다는 뜻이므로 안내하고 종료한다.
- `gh pr list --head <현재 브랜치> --state open`으로 이미 열린 PR이 있는지 확인한다. 있으면 기존 PR
  URL을 안내하고 종료한다(중복 생성 방지).

### Step 2: base 브랜치 확정 및 diff 확보

- `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`로 기본 브랜치를 확인한다. 실패하면
  `origin/HEAD`를 기준으로 한다.
- `git log --oneline <base>..HEAD` — 전체 커밋 이력
- `git diff <base>...HEAD --stat` — 변경 규모 파악
- 필요하면 `git diff <base>...HEAD`로 실제 내용을 확인한다(설명과 diff가 다르면 diff가 진실이다).

### Step 3: PR 제목·본문 작성

- **제목**: 70자 이내, 간결하게. 본문에 세부 내용을 담고 제목에 몰아넣지 않는다.
- **본문**: `references/template.md`를 Read로 읽어 그 구조를 그대로 따른다. 커밋 로그와 diff에서 실제
  "왜"를 추출해 채우고, 템플릿의 안내문(`<...>`)은 결과물에 남기지 않는다. diff가 작아 Summary만으로
  충분하면 Changes 섹션은 생략한다.

### Step 4: 사용자 승인

작성한 제목·본문과 다음 사항을 사용자에게 보여주고 승인을 받는다:

- push가 필요한지 여부(원격 추적 브랜치 유무)
- 대상 base 브랜치

승인 전에는 `git push`나 `gh pr create`를 실행하지 않는다. 사용자가 수정을 요청하면 반영 후 다시
확인받는다.

### Step 5: push 및 PR 생성

1. 원격 추적 브랜치가 없으면 `git push -u origin <브랜치>`, 있으면 `git push`.
2. PR 본문은 헤레독으로 전달해 포맷을 보존한다:

```bash
gh pr create --title "<제목>" --body "$(cat <<'EOF'
<본문>
EOF
)"
```

3. 생성된 PR URL을 사용자에게 보고한다.

## 안전 수칙

- `git push --force`는 사용하지 않는다.
- `gh pr create`, `git push`는 **사용자 승인 후에만** 실행한다 — 되돌리기 어렵고 외부(협업자)에
  노출되는 작업이다.
- diff에 시크릿(API 키, 토큰, `.env` 값 등)으로 의심되는 내용이 보이면 즉시 사용자에게 경고하고, 해당
  커밋이 이미 push되지 않았다면 진행을 중단한다. 이미 push된 경우 되돌리기는 이 스킬의 범위 밖이므로
  사용자에게 알리기만 한다.
- PR 본문에는 자체 생성 내용만 담는다. 셸 명령 출력이나 커밋 메시지에 포함된 시크릿을 그대로 옮기지
  않는다.
