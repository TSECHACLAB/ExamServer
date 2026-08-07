/**
 * テスト演習サイトのデータ型定義
 *
 * 問題データはリポジトリ内のJSONファイルで管理し、
 * スタイル（レイアウト）は問題ごとに指定する設計。
 */

// ---------------------------------------------------------------------------
// 問題スタイル・タイプ
// ---------------------------------------------------------------------------

/** 問題のレイアウトスタイル */
export type QuestionStyle = "oneshot" | "scenario";

/** 回答形式 */
export type QuestionType = "single-choice" | "multiple-choice";

/** 演習トップで使うカテゴリ分類 */
export type CategoryGroup = "certification" | "lab" | "demo";

/** 問題の公開元区分。実試験で出題された問題とサンプルを混同しないために使う。 */
export type QuestionSourceKind =
  | "official-past"
  | "official-sample"
  | "original";

/** 問題から、カテゴリ内の公式資料台帳を参照するための情報 */
export interface QuestionSourceReference {
  sourceId: string;
  /** 公式資料上の問番号。小問を含む場合に備えて文字列で保持する。 */
  questionNumber: string;
  /** PDFから句読点、改行、表などを変更しているか */
  modified: boolean;
  /** 台帳の既定説明では不足する場合の問題固有の変更内容 */
  modificationNote?: string;
  /** 重複統合前の資料での正答位置。主出典と異なる場合も履歴として保持する。 */
  originalAnswer?: number | number[];
}

/** 受験前のクライアントへ配信できる出典情報。正答位置は含めない。 */
export type PublicQuestionSourceReference = Omit<
  QuestionSourceReference,
  "originalAnswer"
>;

export type SourcePublicationStatus = "published" | "not-published";
export type SourceExerciseStatus =
  | "complete"
  | "partial"
  | "pending"
  | "excluded"
  | "unsupported-format"
  | "not-available";

export interface SourceDocument {
  url: string;
  sha256: string;
}

/** 一つの公式問題冊子又はサンプル問題セット */
export interface QuestionSourceSet {
  id: string;
  kind: Exclude<QuestionSourceKind, "original">;
  title: string;
  year?: number;
  season?: string;
  section: string;
  publicationStatus: SourcePublicationStatus;
  exerciseStatus: SourceExerciseStatus;
  officialPageUrl: string;
  /** 午後のように大問を小問へ分解した資料での、公式大問数 */
  publishedMajorQuestionCount?: number;
  publishedQuestionCount: number;
  /** 複数の解答欄を本来の複数選択へ戻した後の演習問題数 */
  playableQuestionCount?: number;
  expectedQuestionNumbers?: string[];
  questionPdf?: SourceDocument;
  answerPdf?: SourceDocument;
  commentaryPdf?: SourceDocument;
  defaultModificationNote?: string;
  notes?: string;
}

/** 受験前のクライアントへ配信する、表示に必要な範囲だけの資料情報 */
export interface PublicQuestionSourceSet {
  id: string;
  kind: Exclude<QuestionSourceKind, "original">;
  title: string;
  year?: number;
  season?: string;
  section: string;
  officialPageUrl: string;
  questionPdf?: Pick<SourceDocument, "url">;
  defaultModificationNote?: string;
}

export interface QuestionSourcePublisher {
  name: string;
  reusePolicyUrl: string;
}

export interface QuestionSourceRegistry {
  categoryId: string;
  publisher: QuestionSourcePublisher;
  sources: QuestionSourceSet[];
}

// ---------------------------------------------------------------------------
// 問題データ
// ---------------------------------------------------------------------------

/** 個別の問題 */
export interface Question {
  id: string;
  style: QuestionStyle;
  type: QuestionType;
  /** 問題文で選択数が明示された複数選択問題の上限 */
  selectionLimit?: number;
  /** 問題文（Markdown対応） */
  text: string;
  /** 画像パス（任意） */
  image?: string | null;
  /** 選択肢（2〜10個） */
  options: string[];
  /** 正解のインデックス。単一選択は number、複数選択は number[] */
  answer: number | number[];
  /** 解説（Markdown対応） */
  explanation: string;
  /** 出題ドメイン。設定画面で絞り込みに使う（任意） */
  domain?: string;
  /** 同一問題が複数の年度・期に出題された場合の全ドメイン */
  domains?: string[];
  /** 出題元。公式問題はsources.jsonの資料セットへ結び付ける。 */
  source?: QuestionSourceReference;
  /** 重複問題を一問へ統合したときの、主出典以外の出題履歴 */
  sourceOccurrences?: QuestionSourceReference[];
}

/** クライアントに配信する問題（正解、解説、重複元の正答位置を除外） */
export type PublicQuestion = Omit<
  Question,
  "answer" | "explanation" | "source" | "sourceOccurrences"
> & {
  source?: PublicQuestionSourceReference;
  sourceOccurrences?: PublicQuestionSourceReference[];
};

/** 問題ファイルのルート構造（一問一答型） */
export interface QuestionFile {
  questions: Question[];
}

// ---------------------------------------------------------------------------
// シナリオ（長文問題）
// ---------------------------------------------------------------------------

/** 長文シナリオ */
export interface Scenario {
  id: string;
  title: string;
  /** シナリオ本文（Markdown対応） */
  scenario: string;
  /** シナリオに使う画像パスの配列 */
  scenarioImages?: string[];
  /** シナリオに紐づく小問 */
  questions: Question[];
}

/** クライアントに配信するシナリオ（正解・解説を除外） */
export interface PublicScenario {
  id: string;
  title: string;
  scenario: string;
  scenarioImages?: string[];
  questions: PublicQuestion[];
}

// ---------------------------------------------------------------------------
// カテゴリ
// ---------------------------------------------------------------------------

/** 試験カテゴリ */
export interface Category {
  id: string;
  name: string;
  description: string;
  /** 演習トップでの分類 */
  group: CategoryGroup;
  /** このカテゴリの問題に適用するデフォルトスタイル */
  defaultStyle: QuestionStyle;
  /** 制限時間（秒） */
  timeLimit: number;
}

// ---------------------------------------------------------------------------
// 試験メタ情報
// ---------------------------------------------------------------------------

/** カテゴリごとの追加メタ情報 */
export interface ExamMeta {
  categoryId: string;
  /** 合格点（%） */
  passingScore?: number;
  /** 説明文 */
  description?: string;
}

// ---------------------------------------------------------------------------
// 受験セッション
// ---------------------------------------------------------------------------

/** 受験モード */
export type ExamMode = "exam" | "drill";

/** 受験設定 */
export interface ExamConfig {
  categoryId: string;
  mode: ExamMode;
  /** 出題数（nullで全問） */
  questionCount: number | null;
  /** タイマー使用 */
  timerEnabled: boolean;
}

/** 受験中の1問の回答状態 */
export interface AnswerState {
  questionId: string;
  /** 選んだ選択肢のインデックス。未回答は null */
  selectedAnswer: number | number[] | null;
  /** フラグ付き */
  flagged: boolean;
  /** 意図的に「分からない」とした */
  uncertain: boolean;
}

// ---------------------------------------------------------------------------
// 採点結果
// ---------------------------------------------------------------------------

/** 1問の採点結果 */
export interface QuestionResult {
  questionId: string;
  /** ユーザーの回答 */
  userAnswer: number | number[] | null;
  /** 正解 */
  correctAnswer: number | number[];
  /** 正解したか（部分点は0〜1の小数） */
  score: number;
  /** 解説 */
  explanation: string;
}

/** 試験全体の採点結果 */
export interface ExamResult {
  categoryId: string;
  mode: ExamMode;
  /** 各問の結果 */
  results: QuestionResult[];
  /** 総合スコア（0〜100） */
  totalScore: number;
  /** 正解数 */
  correctCount: number;
  /** 出題数 */
  totalCount: number;
  /** 受験日時 */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// 学習進捗（localStorage）
// ---------------------------------------------------------------------------

/** 問題ごとの学習履歴 */
export interface QuestionHistory {
  correct: number;
  wrong: number;
  lastAnswer: number | number[];
}

/** カテゴリごとの進捗 */
export interface CategoryProgress {
  lastAttempt: string;
  attempts: number;
  bestScore: number;
  questionHistory: Record<string, QuestionHistory>;
}

/** localStorage に保存する全体の進捗 */
export type StudyProgress = Record<string, CategoryProgress>;

// ---------------------------------------------------------------------------
// API レスポンス
// ---------------------------------------------------------------------------

/** 単問の回答検証レスポンス */
export interface AnswerResponse {
  questionId: string;
  correct: boolean;
  score: number;
  answer: number | number[];
  explanation: string;
}

/** 一括採点リクエスト */
export interface BatchAnswerRequest {
  answers: {
    questionId: string;
    answer: number | number[] | null;
  }[];
}

/** 一括採点レスポンス */
export interface BatchAnswerResponse {
  results: QuestionResult[];
  totalScore: number;
  correctCount: number;
  totalCount: number;
}
