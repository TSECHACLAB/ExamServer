# Task Contract: 演習導線のDADS全面刷新

## Frame

- Outcome: 利用者が、演習選択から採点結果まで同じ操作文法で迷わず進み、設定どおりの条件と保存結果を信頼できる。
- One-sentence specification: `/`の演習選択、設定、受験、一問一答、終了確認、結果、読込・空・失敗状態をデジタル庁デザインシステム準拠へ統一し、既存機能レビューの不一致を同じ演習境界内で解消する。
- Primary user: 日本語でIT資格・基礎問題を繰り返し解く初心者から中級者。
- Moment of satisfaction: 最後の問題で「回答状況を確認」を押すと、未回答と見直し対象を把握してから、自分の意思で採点を確定できる。
- First-contact target: 到着後10秒以内に、演習の種類、次の操作、開始できない項目の理由を理解できる。

## Scope

- `/`、`/?bucket=...`、`/exam/[categoryId]`、`/exam/[categoryId]/session`と、その全表示状態。
- DADS v2.17.0のガイドライン、公式React実装、公式デザイントークンを一次ソースとする。
- 既存5テーマは同じ構造・部品の意味別カラーバリエーションとして維持する。
- 既存レビューのタイマー、終了確認、URL検証、通信失敗、復元、合格基準、回答状態、保存形式の指摘を解消する。

## Non-goals

- `/learn`、`/lab`、`/TSHLadmin`の画面構造を変更しない。
- 問題文、選択肢、正答、解説、公式出典データを改稿しない。
- Pearson VUEの外観、全画面、解像度変更機能を再導入しない。
- ランキング、ストリーク、実績、ダッシュボードを追加しない。
- DADS公式repo全体や未使用Storybookをvendorしない。

## State Model

```text
setup -> loading -> active
exam:  active -> review -> submitting -> finished
drill: active -> feedback -> active -> finished
error: loading/submitting -> error -> retry previous operation
timeout: active(exam) -> submitting exactly once -> finished
```

- Empty: 問題0件の理由と設定へ戻る操作を表示する。
- Invalid: URL設定の具体的な誤りと安全な復帰先を表示する。
- Stalled/error: 問題取得、単問採点、一括採点を区別し、再試行できる。
- Limit: 複数選択上限は操作不能だけで伝えず、選択可能数を文章で示す。
- Drill timer: 一問一答では使用しない。

## Responsibility Boundaries

- Server session page: URLとカテゴリ固有設定を検証して正規化する。
- `useExamSession`: 問題取得、受験状態、期限、採点、復元を所有する。
- Exam screen components: 状態を表示し、利用者の意図をactionとして渡す。
- DADS vendor: 上流コードを改変せず保持する。
- DADS adapters: React 19、Next.js、既存テーマ、内部リンクを接続する。
- Storage: version移行とattempt単位の冪等保存を所有する。

## Interfaces

- `NormalizedExamSessionConfig`: categoryId、mode、questionCount、timerEnabled、randomEnabled、selectedDomains。
- `ExamSessionPhase`: loading、active、feedback、review、submitting、finished、error。
- `ExamSessionError`: operation、message、retryable。
- `FinishReason`: manual、time-expired。
- `SessionStateV2`: version、attemptId、configFingerprint、questionIds、answers、currentIndex、deadlineAt、phase、drillResults、completedResult。
- `StudyProgressV2`: version付きenvelope。`QuestionHistory.lastAnswer`はnullable。

## Deletion And Consolidation

- 見た目だけのradio/checkbox buttonを削除し、native inputを唯一の選択状態にする。
- `window.confirm`、解説内と固定footerの重複「次へ」、現在位置を示していた誤った進捗barを削除する。
- 回答済み判定を`isAnswered`へ、回答正規化を`normalizeSelectedAnswer`へ統合する。
- session中のcategory client fetchを削除し、serverで確定したcategory/timeLimit/passingScoreを渡す。

## Rejected Alternatives

- DADSの色だけを既存classへ当てる: semantics、focus、状態遷移、出典が改善されない。
- 公式repoをGit依存にする: consumer packageではなくReact 18/Tailwind 3前提まで抱える。
- 公式ファイルを直接編集する: 上流差分とローカル判断を区別できない。
- 5テーマごとに別componentを作る: 操作文法とアクセシビリティが分岐する。

## Acceptance Criteria

- 演習配下の共通primitiveは公式vendor又はそのadapterを使用し、上流SHA-256を検証できる。
- 5テーマ、390x844、1440x900で同じ情報構造を保ち、横scrollと固定領域の被覆がない。
- radio、checkbox、fieldset、legend、dialog focus、aria-currentが支援技術へ公開される。
- 設定した30分が1800秒で開始し、0秒で一度だけ自動採点する。
- 最終問題から終了前確認を経なければ手動採点しない。
- 通信失敗を無限読込や空問題として表示せず、二重送信を防ぎ再試行できる。
- 一問一答のfeedbackと完了を再読込後も復元し、結果を一度だけ保存する。
- カテゴリ固有の60/65/75%基準を合否文言に使用する。
- 旧storageの集計値を保ち、曖昧な`lastAnswer`だけを`null`へ移行する。
- validate、unit/integration、DADS source audit、accessibility E2E、lint、production buildが成功する。

## Tripwires

- 上流vendorファイルへの直接編集が必要になったらadapter境界へ戻る。
- 同じ状態判定が3箇所に現れたら共通domain helperへ戻す。
- 1 componentが500行を超える前に状態ownerとpresentationを分割する。
- 問題データの改稿が必要になったら本タスクから分離する。
