/** ブラウザの学習進捗を version 2 形式で保存・移行する。 */

import type {
  CategoryProgress,
  ExamResult,
  QuestionHistory,
  StudyProgress,
  StudyProgressV2,
} from "@/types/exam";
import { normalizeSelectedAnswer } from "@/lib/answer-state";

export const PROGRESS_STORAGE_KEY = "exam-server-progress";
const MAX_PROCESSED_ATTEMPTS = 500;

export function loadStudyProgress(): StudyProgressV2 {
  if (typeof window === "undefined") return emptyProgress();

  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return emptyProgress();

    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateProgress(parsed);
    if (!isStudyProgressV2(parsed) || JSON.stringify(parsed) !== JSON.stringify(migrated)) {
      saveStudyProgress(migrated);
    }
    return migrated;
  } catch {
    return emptyProgress();
  }
}

/** カテゴリ一覧向けの互換API。保存形式自体は version 2。 */
export function loadProgress(): StudyProgress {
  return loadStudyProgress().categories;
}

export function loadCategoryProgress(categoryId: string): CategoryProgress | null {
  return loadStudyProgress().categories[categoryId] ?? null;
}

/**
 * 同じ attemptId は一度だけ反映する。
 * @returns 今回新たに保存した場合 true
 */
export function saveExamResult(result: ExamResult): boolean {
  const progress = loadStudyProgress();
  if (progress.processedAttemptIds.includes(result.attemptId)) return false;

  const current = progress.categories[result.categoryId] ?? emptyCategoryProgress();
  const nextCategory: CategoryProgress = {
    ...current,
    questionHistory: { ...current.questionHistory },
    lastAttempt: result.timestamp,
    attempts: current.attempts + 1,
    bestScore: Math.max(current.bestScore, result.totalScore),
  };

  for (const item of result.results) {
    const previous = nextCategory.questionHistory[item.questionId] ?? emptyHistory();
    nextCategory.questionHistory[item.questionId] = {
      correct: previous.correct + (item.score === 1 ? 1 : 0),
      wrong: previous.wrong + (item.score === 1 ? 0 : 1),
      lastAnswer: normalizeSelectedAnswer(item.userAnswer),
    };
  }

  progress.categories[result.categoryId] = nextCategory;
  progress.processedAttemptIds = [
    ...progress.processedAttemptIds,
    result.attemptId,
  ].slice(-MAX_PROCESSED_ATTEMPTS);
  saveStudyProgress(progress);
  return true;
}

function migrateProgress(value: unknown): StudyProgressV2 {
  if (isStudyProgressV2(value)) {
    return {
      version: 2,
      categories: normalizeCategories(value.categories, false),
      processedAttemptIds: value.processedAttemptIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    };
  }

  // version 1 はカテゴリIDを直下に持つ。旧 lastAnswer=0 は未回答との
  // 区別がつかないため、集計値を保持したまま null に移行する。
  return {
    version: 2,
    categories: normalizeCategories(value, true),
    processedAttemptIds: [],
  };
}

function normalizeCategories(value: unknown, legacy: boolean): StudyProgress {
  if (!isRecord(value)) return {};
  const categories: StudyProgress = {};

  for (const [categoryId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const histories = isRecord(candidate.questionHistory)
      ? candidate.questionHistory
      : {};
    const questionHistory: Record<string, QuestionHistory> = {};

    for (const [questionId, history] of Object.entries(histories)) {
      if (!isRecord(history)) continue;
      const rawAnswer = history.lastAnswer;
      const normalizedAnswer = normalizeStoredAnswer(rawAnswer, legacy);
      questionHistory[questionId] = {
        correct: nonNegativeInteger(history.correct),
        wrong: nonNegativeInteger(history.wrong),
        lastAnswer: normalizedAnswer,
      };
    }

    categories[categoryId] = {
      lastAttempt: typeof candidate.lastAttempt === "string" ? candidate.lastAttempt : "",
      attempts: nonNegativeInteger(candidate.attempts),
      bestScore: finiteNumber(candidate.bestScore),
      questionHistory,
    };
  }

  return categories;
}

function normalizeStoredAnswer(value: unknown, legacy: boolean): QuestionHistory["lastAnswer"] {
  if (legacy && value === 0) return null;
  if (value === null || typeof value === "number") {
    return normalizeSelectedAnswer(value);
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return normalizeSelectedAnswer(value);
  }
  return null;
}

function saveStudyProgress(progress: StudyProgressV2): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

function emptyProgress(): StudyProgressV2 {
  return { version: 2, categories: {}, processedAttemptIds: [] };
}

function emptyCategoryProgress(): CategoryProgress {
  return { lastAttempt: "", attempts: 0, bestScore: 0, questionHistory: {} };
}

function emptyHistory(): QuestionHistory {
  return { correct: 0, wrong: 0, lastAnswer: null };
}

function isStudyProgressV2(value: unknown): value is StudyProgressV2 {
  return (
    isRecord(value) &&
    value.version === 2 &&
    isRecord(value.categories) &&
    Array.isArray(value.processedAttemptIds)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
