/**
 * 学習進捗の保存・読み込み（localStorage）
 *
 * ブラウザ専用。サーバーサイドでの呼び出しは空の結果を返す。
 */

import type {
  StudyProgress,
  CategoryProgress,
  ExamResult,
} from "@/types/exam";

const STORAGE_KEY = "exam-server-progress";

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

/** 全進捗を取得 */
export function loadProgress(): StudyProgress {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StudyProgress) : {};
  } catch {
    return {};
  }
}

/** カテゴリの進捗を取得 */
export function loadCategoryProgress(
  categoryId: string
): CategoryProgress | null {
  const progress = loadProgress();
  return progress[categoryId] ?? null;
}

// ---------------------------------------------------------------------------
// 保存
// ---------------------------------------------------------------------------

/** 全進捗を保存 */
function saveProgress(progress: StudyProgress): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/**
 * 試験結果を進捗に反映する
 * 問題ごとの正答・誤答回数を更新し、ベストスコアを記録。
 */
export function saveExamResult(result: ExamResult): void {
  const progress = loadProgress();
  const current = progress[result.categoryId] ?? {
    lastAttempt: "",
    attempts: 0,
    bestScore: 0,
    questionHistory: {},
  };

  current.lastAttempt = result.timestamp;
  current.attempts += 1;
  current.bestScore = Math.max(current.bestScore, result.totalScore);

  for (const r of result.results) {
    const history = current.questionHistory[r.questionId] ?? {
      correct: 0,
      wrong: 0,
      dontKnow: 0,
      lastAnswer: null,
      lastDontKnow: false,
    };

    if (r.score === 1) {
      history.correct += 1;
    } else {
      history.wrong += 1;
    }
    history.dontKnow = (history.dontKnow ?? 0) + (r.dontKnow ? 1 : 0);
    history.lastAnswer = r.userAnswer;
    history.lastDontKnow = r.dontKnow;

    current.questionHistory[r.questionId] = history;
  }

  progress[result.categoryId] = current;
  saveProgress(progress);
}
