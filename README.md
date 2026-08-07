# ExamServer

PearsonVUE 風の IT 資格試験オンライン演習サイト。

## 技術スタック

- Next.js 16 (App Router) / TypeScript / Tailwind CSS v4
- GitHub API (Octokit) による問題データ管理
- Vercel デプロイ

## 対応カテゴリ

- LPIC-1 101 / 102
- AWS Certified Security - Specialty
- 情報セキュリティマネジメント
- 情報処理安全確保支援士
- 一般常識（サンプル）

## 機能

- 本番モード（全問解答 → 一括採点）/ 一問一答モード（即時フィードバック）
- 一問一答レイアウト / 長文シナリオレイアウト（PC左右分割・スマホ折りたたみ）
- タイマー・フラグ・ランダム出題
- localStorage による学習進捗保存
- 管理画面（問題 CRUD・CSV/JSON 一括アップロード・GitHub API commit）
- CI バリデーション（GitHub Actions）

## ローカル開発

```bash
npm install
cp .env.example .env.local  # 環境変数を設定
npm run dev
```

## 環境変数

| 変数 | 説明 |
|------|------|
| `ADMIN_PASSWORD` | 管理画面のログインパスワード |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_OWNER` | リポジトリオーナー |
| `GITHUB_REPO` | リポジトリ名 |
| `GITHUB_BRANCH` | ブランチ名（デフォルト: main） |

## バリデーション

```bash
npm run validate
npm run verify:sg-sources
npm test
```

## SGの問題データ

SGの本番プールには、IPAが実際の試験問題として公開した問題だけを収録する。令和5〜8年度の公開問題60問と、平成28年度春期〜令和元年度秋期の午前400問・午後257解答欄が対象である。

同一内容の再出題47件は一問に統合し、出題年度と問番号を履歴として残す。午後で一つの設問が複数の解答欄に分かれていた10画面も、元の指示どおり8件の複数選択問題へ戻す。このため、公式資料上の717解答件を、重複のない660問として演習できる。

公式サンプル63問は出典台帳だけに残し、本番プールには含めない。IPAが非公開としている令和2〜4年度や、出典不明の転載・記憶再現問題・exam dumpも収録しない。詳しい収録範囲と照合結果は [問題データと公式公開範囲の監査](docs/reviews/question-source-audit-2026-08-06.md) を参照。

## 開発ルール

Issue / PR の切り方、検証方針、レビュー観点は `docs/DEVELOPMENT_RULES.md` を参照してください。
