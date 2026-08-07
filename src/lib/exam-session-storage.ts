import type {
  AnswerResponse,
  AnswerState,
  ExamResult,
  ExamSessionPhase,
  SessionStateV2,
} from "@/types/exam";
import { normalizeSelectedAnswer } from "@/lib/answer-state";

export const EXAM_SESSION_STORAGE_KEY = "exam-session-state";

export function loadSessionStateV2(
  configFingerprint: string,
): SessionStateV2 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(EXAM_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSessionStateV2(parsed) || parsed.configFingerprint !== configFingerprint) {
      clearSessionState();
      return null;
    }
    return {
      ...parsed,
      answers: parsed.answers.map(normalizeAnswerState),
      phase: recoverablePhase(parsed.phase, parsed),
    };
  } catch {
    clearSessionState();
    return null;
  }
}

export function saveSessionStateV2(state: SessionStateV2): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(EXAM_SESSION_STORAGE_KEY, JSON.stringify(state));
}

export function clearSessionState(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(EXAM_SESSION_STORAGE_KEY);
}

function recoverablePhase(
  phase: ExamSessionPhase,
  state: SessionStateV2,
): ExamSessionPhase {
  if (phase === "submitting" || phase === "error") {
    if (state.mode === "drill" && state.drillResults[state.questionIds[state.currentIndex]]) {
      return "feedback";
    }
    return state.mode === "exam" ? "active" : "active";
  }
  return phase;
}

function normalizeAnswerState(answer: AnswerState): AnswerState {
  return {
    questionId: answer.questionId,
    selectedAnswer: normalizeSelectedAnswer(answer.selectedAnswer),
    flagged: Boolean(answer.flagged),
    uncertain: Boolean(answer.uncertain),
  };
}

function isSessionStateV2(value: unknown): value is SessionStateV2 {
  if (!isRecord(value) || value.version !== 2) return false;
  if (!(
    isNonEmptyString(value.attemptId) &&
    isNonEmptyString(value.configFingerprint) &&
    isNonEmptyString(value.categoryId) &&
    (value.mode === "exam" || value.mode === "drill") &&
    Array.isArray(value.questionIds) &&
    value.questionIds.length > 0 &&
    value.questionIds.every(isNonEmptyString) &&
    Array.isArray(value.answers) &&
    value.answers.length === value.questionIds.length &&
    value.answers.every(isAnswerState) &&
    typeof value.currentIndex === "number" &&
    Number.isInteger(value.currentIndex) &&
    value.currentIndex >= 0 &&
    value.currentIndex < value.questionIds.length &&
    (value.deadlineAt === null || isFiniteNumber(value.deadlineAt)) &&
    isPhase(value.phase) &&
    isAnswerResponseMap(value.drillResults) &&
    (value.completedResult === null || isExamResult(value.completedResult))
  )) return false;

  const candidate = value as unknown as SessionStateV2;
  const uniqueQuestionIds = new Set(candidate.questionIds);
  const answersMatchQuestions = candidate.answers.every(
    (answer, index) => answer.questionId === candidate.questionIds[index],
  );
  const drillResultsMatchQuestions = Object.entries(candidate.drillResults).every(
    ([questionId, result]) =>
      uniqueQuestionIds.has(questionId) && result.questionId === questionId,
  );
  const completedResultMatchesSession =
    candidate.completedResult === null ||
    (candidate.completedResult.attemptId === candidate.attemptId &&
      candidate.completedResult.categoryId === candidate.categoryId &&
      candidate.completedResult.mode === candidate.mode &&
      candidate.completedResult.totalCount === candidate.questionIds.length &&
      new Set(candidate.completedResult.results.map((result) => result.questionId)).size ===
        candidate.questionIds.length &&
      candidate.completedResult.results.every((result) =>
        uniqueQuestionIds.has(result.questionId),
      ));
  const phaseMatchesMode =
    (candidate.mode === "exam" && candidate.phase !== "feedback") ||
    (candidate.mode === "drill" && candidate.phase !== "review");
  const completionMatchesPhase =
    (candidate.phase === "finished") === (candidate.completedResult !== null);
  const resolvedDrillCount =
    candidate.phase === "finished"
      ? candidate.questionIds.length
      : candidate.phase === "feedback"
        ? candidate.currentIndex + 1
        : candidate.currentIndex;
  const drillProgressIsComplete =
    candidate.mode === "exam"
      ? Object.keys(candidate.drillResults).length === 0
      : candidate.questionIds
          .slice(0, resolvedDrillCount)
          .every((questionId) => candidate.drillResults[questionId] !== undefined);

  return (
    uniqueQuestionIds.size === candidate.questionIds.length &&
    answersMatchQuestions &&
    drillResultsMatchQuestions &&
    completedResultMatchesSession &&
    phaseMatchesMode &&
    completionMatchesPhase &&
    drillProgressIsComplete
  );
}

function isAnswerState(value: unknown): value is AnswerState {
  return (
    isRecord(value) &&
    isNonEmptyString(value.questionId) &&
    isSelectedAnswer(value.selectedAnswer) &&
    typeof value.flagged === "boolean" &&
    typeof value.uncertain === "boolean"
  );
}

function isAnswerResponseMap(value: unknown): value is Record<string, AnswerResponse> {
  return isRecord(value) && Object.values(value).every((entry) => {
    return (
      isRecord(entry) &&
      isNonEmptyString(entry.questionId) &&
      typeof entry.correct === "boolean" &&
      isFiniteNumber(entry.score) &&
      entry.score >= 0 &&
      entry.score <= 1 &&
      isSelectedAnswer(entry.answer) &&
      entry.answer !== null &&
      typeof entry.explanation === "string"
    );
  });
}

function isExamResult(value: unknown): value is ExamResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value.attemptId) &&
    isNonEmptyString(value.categoryId) &&
    (value.mode === "exam" || value.mode === "drill") &&
    isFinishReason(value.finishReason) &&
    isFiniteNumber(value.passingScore) &&
    value.passingScore >= 0 &&
    value.passingScore <= 100 &&
    Array.isArray(value.results) &&
    value.results.every(isQuestionResult) &&
    isFiniteNumber(value.totalScore) &&
    value.totalScore >= 0 &&
    value.totalScore <= 100 &&
    typeof value.correctCount === "number" &&
    Number.isInteger(value.correctCount) &&
    value.correctCount >= 0 &&
    typeof value.totalCount === "number" &&
    Number.isInteger(value.totalCount) &&
    value.totalCount === value.results.length &&
    value.correctCount <= value.totalCount &&
    isNonEmptyString(value.timestamp) &&
    !Number.isNaN(Date.parse(value.timestamp))
  );
}

function isQuestionResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.questionId) &&
    isSelectedAnswer(value.userAnswer) &&
    isCorrectAnswer(value.correctAnswer) &&
    isFiniteNumber(value.score) &&
    value.score >= 0 &&
    value.score <= 1 &&
    typeof value.explanation === "string"
  );
}

function isFinishReason(value: unknown): boolean {
  return value === "manual" || value === "time-expired" || value === "drill-complete";
}

function isSelectedAnswer(value: unknown): value is number | number[] | null {
  return (
    value === null ||
    isAnswerIndex(value) ||
    (Array.isArray(value) && value.every(isAnswerIndex))
  );
}

function isCorrectAnswer(value: unknown): value is number | number[] {
  return (
    isAnswerIndex(value) ||
    (Array.isArray(value) && value.length > 0 && value.every(isAnswerIndex))
  );
}

function isAnswerIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPhase(value: unknown): value is ExamSessionPhase {
  return [
    "loading",
    "active",
    "review",
    "feedback",
    "submitting",
    "finished",
    "error",
  ].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
