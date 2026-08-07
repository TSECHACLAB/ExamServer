# Task Contract

## Goal

- User request: 演習に使う問題内容を改善し、少なくとも公式に公開されている過去問を漏れなく拾う。
- Real problem being solved: 現行データは公式問題、自作問題、サンプル問題の区別が本文中の自由記述に埋もれ、公式公開範囲に対する収録漏れ、出典の誤記、改変の未表示を自動検知できない。
- One-sentence specification: IPAが実際の試験問題として公開したSG過去問を、出典・問番号・改変有無へ構造的に結び付け、重複なく100%演習できる状態にする。
- Primary user: 資格試験の出題元と同じ問題で演習し、解答後に正答理由を確認したい受験者。
- Frequency and decision: 日々の演習で年度・期・午前午後を選び、実際に出題された公式問題だけを解く。

## Scope

- Current CBT publications: 令和5〜8年度にIPAが公開したSG科目A・Bの全60問を実過去問として収録する。
- Historical publications: 平成28年度春期から令和元年度秋期までのSG筆記試験を、午前400問と午後24大問の文脈を保って全て演習化する。
- Live-pool rule: `official-past`だけをSG演習の本番問題に含める。公式サンプル、自作問題、仮問題、取込途中の問題は含めない。
- Duplicate rule: Unicode、空白、句読点、選択肢順を正規化した完全一致に加え、高類似問題を監査する。同じ問題が複数資料にある場合は、実過去問を優先し、同じ実過去問内では出題回を一つだけ残す。午後の一つの設問に複数の公式解答欄がある場合は、解答欄ごとの重複画面に分割せず、本来の複数選択1問へ戻す。
- Cross-category inventory: SC、AWS SCS、LPIC-1、Java Silverについて、公式過去問・公式サンプル・出題範囲の公開有無を記録する。
- Explicitly unavailable: IPAが非公開としている令和2〜4年度SG、試験実施団体が公開していない実試験問題、流出問題、記憶再現問題、exam dump。

## Non-goals

- 出典不明の転載サイトや受験者の記憶による問題を「公式過去問」として取り込まない。
- SCの記述式問題を、正答が一つの選択問題へ変形して収録しない。
- AWS Skill Builderなど認証・契約内の公式練習問題を、利用条件を確認せず複製しない。
- 問題収録と無関係な演習UIの再設計は行わない。
- 全問題を機械翻訳・自動生成し、未照合のまま公開可能扱いにしない。OCR又は転記支援を使った場合も、公式PDFと公式正答表の照合を完了条件にする。
- 公式サンプル問題を実過去問として混ぜない。

## Approach

- Chosen approach: 公式ページとPDFを一次資料として、公開セット台帳、問題単位の出典参照、スキーマ検証、PDF原本との目視照合を一つの収録経路にする。
- Rejected alternatives:
  - 解説末尾の自由記述だけで出典を管理する: URL、改変有無、完全性を検証できない。
  - 公式PDFをそのまま大量にGitへ格納する: バイナリ肥大化と差分レビュー困難を招く。公式URLとハッシュを台帳に保持し、必要時に取得する。
  - 旧SG午後やSC記述式を一問一答へ平坦化する: 文脈と回答形式を壊し、公式問題と称するには不忠実になる。
- Reuse/delete: 既存の`Question`、`questions.json`、`scenario-*.json`、`validate-schema.ts`を拡張する。ライブプールの公式サンプル63問は削除し、本文中だけにある重複した出典管理は構造化メタデータへ寄せる。

## Failure Modes

1. 「全て」を非公開問題まで含むと誤認し、dumpや出典不明問題を混ぜる。
   - Prevention: source kindとofficial URLを必須化し、非公開期間を台帳で明示する。
2. PDF抽出時に表、図、改行、選択肢対応又は正答を壊したまま演習へ載せる。
   - Prevention: 正答表との機械照合、代表ページの画像確認、表を含む問題の個別レビュー、問題数と問番号の連続性検証を行う。

## Observable Acceptance Criteria

- 公式資料セットごとに公開元URL、問題PDF、解答PDF、公開問題数、収録状態、非公開又は形式非対応の理由を確認できる。
- 令和5〜8年度SG公開問題は問1〜15が各年度一度ずつ存在し、合計60問になる。
- 60問すべてが`official-past`として構造化された出典、公式問番号、改変有無を持つ。
- 平成28年度春期〜令和元年度秋期の午前は各期50問、合計400問が一度ずつ存在する。
- 同期間の午後は各期3大問、合計24大問、公式解答欄257件が存在する。繰返し設問18解答欄は8件の複数選択問題へ統合し、文脈と正答集合を保った247問として演習できる。
- SGの本番問題に`official-sample`、`original`、仮ID、仮本文が0件である。
- 正規化完全重複は0件、高類似候補は全件に残す又は除外の判定記録がある。
- 令和8年度15問の問題文、選択肢、正答がIPA原本と一致し、表を含む問題も意味を失わない。
- 解説は正答に至る根拠を問題固有に説明し、一般論だけで終わらない。誤答に触れる場合は、見えている選択肢と公式本文から確認できる違いだけを書く。
- `npm run validate`、対象テスト、lint、buildが成功する。
- 公式問題だけを選べる状態が、API又は演習設定から利用者に判別可能である。

## Explanation Quality Extension (2026-08-07)

- User extension: 問題数と出典だけでなく、解答後に読む解説の質も全件で保証する。
- Moment of satisfaction: 誤答した受験者が、外部サイトを開かずに「何を見落としたか」と「次に同種問題をどう判定するか」を理解できる。
- One-sentence specification: SGのライブ660問すべてについて、公式正答との一致、問題固有の決め手、誤答との違い、本文又は図表との対応を監査し、一般論・復唱・使い回しを残さない。
- Affected owners: `data/exams/sg/questions.json`、`data/exams/sg/scenario-*.json`、`artifacts/question-content/*explanation*.json`、解説生成・監査script、監査報告。
- Data flow: 公式問題と正答 → 現行解説inventory → 決定的な形式検査 → 独立reviewerによる内容監査 → correction overlay → build済み問題データ → 再監査。
- Tradeoff: 全問を一つのmodelで書き直す方が速いが、正しかった解説まで劣化し、生成者と監査者の誤りが相関する。既存解説を保持し、問題が確認できた項目だけを別reviewerの指摘と原問に基づいて直す。
- Rejected alternatives:
  - 文字数だけを増やす: 根拠のない説明が長くなるだけで、誤答訂正にはならない。
  - 全選択肢を必ず列挙する: 午後の図表選択や複数解答では冗長になり、肝心の条件対応が埋もれる。
  - 生成model自身の自己採点だけで通す: 同じ思い込みを見逃すため、独立reviewerと決定的検査を分ける。
- Additional non-goals:
  - 公式資料又は問題文から裏付けられない周辺知識を、水増しのために足さない。
  - 補助転記サイトの文章、内部照合メモ、model名を利用者向け解説へ露出しない。
  - 文体を均一な定型文へ揃えない。正答理由に必要な長さを問題ごとに選ぶ。
- Additional acceptance criteria:
  - 660問すべてに、公式正答と一致する見出しと問題固有の根拠がある。
  - 現行・旧午前の一問一答は、決め手に加えて主要な誤答との差を少なくとも一つ説明する。ただし計算過程だけで他の値を排除できる問題は、その計算過程を優先する。
  - 午後問題は、複数解答を含む全正答要素、空欄、人物、操作、条件を落とさず、シナリオ又は図表との対応を説明する。
  - 異なる問題への同一解説、正答の復唱だけの解説、内部補助資料の露出、根拠のない断定は0件である。
  - 決定的監査は660/660、独立内容監査は660/660を対象にし、最終issue 0件を機械可読なartifactへ残す。
  - 修正対象は原問・正答・選択肢と再照合し、`npm run validate`、対象test、lint、buildを通す。
- Completion evidence: `sg-explanation-quality-audit.json`は決定的監査660/660、独立内容監査660/660、合格660、issue 0、uncertain 0、未監査0を記録した。修正10問、公式証拠による手動再判定4問、回帰テスト69件、実画面の回答前非表示と回答後表示まで確認済み。

## Consistency Checks

- Product constitution: 学習と演習を往復する利用者が、出題元と正答根拠を結果画面で確認できる。
- Architecture/data flow: 公式ページ/PDF → source registry → question `source` reference → question API → session/result display。
- State ownership: 問題内容と出典は`data/exams`が唯一の所有者。UI側に年度別の出典表を重複定義しない。
- Naming: `official-past`、`official-sample`、`original`を区別し、「過去問」は実際に出題され公式公開されたものだけに使う。
- Verification: スキーマ検証、問題数／問番号／ID一意性、正答照合、PDF画像確認、結合テスト、実画面。

## Post-Change Review

- Did this strengthen the core mechanism? 公式問題の追加が速くなるだけでなく、誤出典と収録漏れをCIで止められるか確認する。
- Did it reduce scattered complexity? 解説本文、domain名、ドキュメントに散った出典情報を台帳と問題参照へ集約できたか確認する。
- Did it introduce a new concept? source kindとsource setを追加するため、型、検証、管理画面、APIで同じ意味になっているか確認する。
- What should be consolidated next? 今回実装したSG午後のpassage／scenarioモデルを、SC記述式へ広げる前に独立した設計単位として切り出せるか検討する。
