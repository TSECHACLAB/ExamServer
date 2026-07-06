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

// ---------------------------------------------------------------------------
// 問題データ
// ---------------------------------------------------------------------------

/** 個別の問題 */
export interface Question {
  id: string;
  style: QuestionStyle;
  type: QuestionType;
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
}

/** クライアントに配信する問題（正解・解説を除外） */
export type PublicQuestion = Omit<Question, "answer" | "explanation">;

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
  dontKnow: boolean;
}

// ---------------------------------------------------------------------------
// 採点結果
// ---------------------------------------------------------------------------

/** 1問の採点結果 */
export interface QuestionResult {
  questionId: string;
  /** ユーザーの回答 */
  userAnswer: number | number[] | null;
  /** 意図的に「分からない」とした */
  dontKnow: boolean;
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
  dontKnow: number;
  lastAnswer: number | number[] | null;
  lastDontKnow: boolean;
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
    dontKnow?: boolean;
  }[];
}

/** 一括採点レスポンス */
export interface BatchAnswerResponse {
  results: QuestionResult[];
  totalScore: number;
  correctCount: number;
  totalCount: number;
}
