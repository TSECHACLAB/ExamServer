"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnswerResponse,
  AnswerState,
  BatchAnswerResponse,
  ExamResult,
  ExamSessionError,
  ExamSessionPhase,
  FinishReason,
  NormalizedExamSessionConfig,
  PublicQuestion,
  PublicScenario,
  QuestionSourcePublisher,
  PublicQuestionSourceSet,
  SessionStateV2,
} from "@/types/exam";
import { getQuestionDomains } from "@/lib/question-domains";
import { normalizeSelectedAnswer } from "@/lib/answer-state";
import {
  clearSessionState,
  loadSessionStateV2,
  saveSessionStateV2,
} from "@/lib/exam-session-storage";

interface QuestionsResponse {
  questions: PublicQuestion[];
  scenarios: PublicScenario[];
  sources: PublicQuestionSourceSet[];
  sourcePublisher: QuestionSourcePublisher | null;
}

export interface ExamSessionState {
  questions: PublicQuestion[];
  answers: AnswerState[];
  currentIndex: number;
  remainingTime: number | null;
  phase: ExamSessionPhase;
  error: ExamSessionError | null;
  drillResult: AnswerResponse | null;
  completedResult: ExamResult | null;
  scenarioMap: Record<string, PublicScenario>;
  sourceMap: Record<string, PublicQuestionSourceSet>;
  sourcePublisher: QuestionSourcePublisher | null;
  isLocked: boolean;
}

export interface ExamSessionActions {
  setAnswer: (answer: number | number[]) => void;
  toggleFlag: () => void;
  toggleUncertain: () => void;
  goTo: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
  submitDrill: () => Promise<void>;
  submitUnknownDrill: () => Promise<void>;
  nextDrill: () => void;
  requestReview: () => void;
  resumeExam: (index?: number) => void;
  finishExam: (reason?: FinishReason) => Promise<void>;
  retry: () => Promise<void>;
  abandonSession: () => void;
}

export function useExamSession(
  config: NormalizedExamSessionConfig,
): ExamSessionState & ExamSessionActions {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<AnswerState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [phase, setPhase] = useState<ExamSessionPhase>("loading");
  const [error, setError] = useState<ExamSessionError | null>(null);
  const [drillResults, setDrillResults] = useState<Record<string, AnswerResponse>>({});
  const [completedResult, setCompletedResult] = useState<ExamResult | null>(null);
  const [attemptId, setAttemptId] = useState("");
  const [scenarioMap, setScenarioMap] = useState<Record<string, PublicScenario>>({});
  const [sourceMap, setSourceMap] = useState<Record<string, PublicQuestionSourceSet>>({});
  const [sourcePublisher, setSourcePublisher] =
    useState<QuestionSourcePublisher | null>(null);

  const submittingRef = useRef(false);
  const autoSubmitStartedRef = useRef(false);
  const timerExpired = config.mode === "exam" && remainingTime === 0;

  const loadQuestions = useCallback(async () => {
    setPhase("loading");
    setError(null);
    autoSubmitStartedRef.current = false;

    try {
      const response = await fetch(
        `/api/questions?categoryId=${encodeURIComponent(config.categoryId)}`,
      );
      const data: unknown = await readJson(response);
      if (!response.ok) {
        throw requestError(data, "問題を読み込めませんでした。");
      }
      if (!isQuestionsResponse(data)) {
        throw invalidResponseError("問題データの形式が正しくありません。");
      }

      const nextSourceMap = Object.fromEntries(
        data.sources.map((source) => [source.id, source]),
      );
      const nextScenarioMap: Record<string, PublicScenario> = {};
      for (const scenario of data.scenarios) {
        for (const question of scenario.questions) nextScenarioMap[question.id] = scenario;
      }

      let availableQuestions = [
        ...data.questions,
        ...data.scenarios.flatMap((scenario) => scenario.questions),
      ];
      if (config.selectedDomains.length > 0) {
        availableQuestions = availableQuestions.filter((question) =>
          getQuestionDomains(question).some((domain) =>
            config.selectedDomains.includes(domain),
          ),
        );
      }

      if (availableQuestions.length === 0) {
        setQuestions([]);
        setAnswers([]);
        setError({
          operation: "load",
          kind: "empty",
          message: "選択した範囲には出題できる問題がありません。",
          recoverPhase: "active",
        });
        setPhase("error");
        return;
      }

      const saved = loadSessionStateV2(config.fingerprint);
      const restored = restoreSession(saved, availableQuestions, config.questionCount);
      let nextQuestions: PublicQuestion[];
      let nextAnswers: AnswerState[];
      let nextIndex: number;
      let nextDeadline: number | null;
      let nextPhase: ExamSessionPhase;
      let nextAttemptId: string;
      let nextDrillResults: Record<string, AnswerResponse>;
      let nextCompletedResult: ExamResult | null;

      if (restored) {
        nextQuestions = restored.questions;
        nextAnswers = restored.state.answers;
        nextIndex = Math.min(restored.state.currentIndex, nextQuestions.length - 1);
        nextDeadline = restored.state.deadlineAt;
        nextPhase = restored.state.completedResult ? "finished" : restored.state.phase;
        nextAttemptId = restored.state.attemptId;
        nextDrillResults = restored.state.drillResults;
        nextCompletedResult = restored.state.completedResult;
      } else {
        nextQuestions = config.randomEnabled
          ? shuffle(availableQuestions)
          : [...availableQuestions];
        nextQuestions = nextQuestions.slice(0, config.questionCount);
        nextAnswers = nextQuestions.map((question) => ({
          questionId: question.id,
          selectedAnswer: null,
          flagged: false,
          uncertain: false,
        }));
        nextIndex = 0;
        nextDeadline =
          config.mode === "exam" && config.timerEnabled
            ? Date.now() + config.timeLimit * 1000
            : null;
        nextPhase = "active";
        nextAttemptId = createAttemptId();
        nextDrillResults = {};
        nextCompletedResult = null;
      }

      setSourceMap(nextSourceMap);
      setSourcePublisher(data.sourcePublisher);
      setScenarioMap(nextScenarioMap);
      setQuestions(nextQuestions);
      setAnswers(nextAnswers);
      setCurrentIndex(nextIndex);
      setDeadlineAt(nextDeadline);
      setRemainingTime(calculateRemainingTime(nextDeadline));
      setAttemptId(nextAttemptId);
      setDrillResults(nextDrillResults);
      setCompletedResult(nextCompletedResult);
      setPhase(nextPhase);
    } catch (cause) {
      const requestFailure = toRequestFailure(cause);
      setError({
        operation: "load",
        kind: requestFailure.kind,
        message: requestFailure.message,
        recoverPhase: "active",
      });
      setPhase("error");
    }
  }, [config]);

  useEffect(() => {
    queueMicrotask(() => void loadQuestions());
  }, [loadQuestions]);

  useEffect(() => {
    if (deadlineAt === null || phase === "finished") {
      return;
    }
    const update = () => setRemainingTime(calculateRemainingTime(deadlineAt));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadlineAt, phase]);

  useEffect(() => {
    if (
      phase === "loading" ||
      !attemptId ||
      questions.length === 0 ||
      answers.length !== questions.length
    ) return;
    const state: SessionStateV2 = {
      version: 2,
      attemptId,
      configFingerprint: config.fingerprint,
      categoryId: config.categoryId,
      mode: config.mode,
      questionIds: questions.map((question) => question.id),
      answers,
      currentIndex,
      deadlineAt,
      phase,
      drillResults,
      completedResult,
    };
    saveSessionStateV2(state);
  }, [
    answers,
    attemptId,
    completedResult,
    config,
    currentIndex,
    deadlineAt,
    drillResults,
    phase,
    questions,
  ]);

  useEffect(() => {
    if (phase === "finished") return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const setAnswer = useCallback(
    (answer: number | number[]) => {
      if (phase !== "active" || timerExpired) return;
      const selectedAnswer = normalizeSelectedAnswer(answer);
      setAnswers((previous) =>
        previous.map((item, index) =>
          index === currentIndex
            ? { ...item, selectedAnswer, uncertain: false }
            : item,
        ),
      );
    },
    [currentIndex, phase, timerExpired],
  );

  const toggleFlag = useCallback(() => {
    if (phase !== "active" || timerExpired) return;
    setAnswers((previous) =>
      previous.map((item, index) =>
        index === currentIndex ? { ...item, flagged: !item.flagged } : item,
      ),
    );
  }, [currentIndex, phase, timerExpired]);

  const toggleUncertain = useCallback(() => {
    if (phase !== "active" || timerExpired) return;
    setAnswers((previous) =>
      previous.map((item, index) =>
        index === currentIndex
          ? {
              ...item,
              selectedAnswer: null,
              uncertain: !item.uncertain,
            }
          : item,
      ),
    );
  }, [currentIndex, phase, timerExpired]);

  const goTo = useCallback(
    (index: number) => {
      if (
        phase !== "active" ||
        timerExpired ||
        index < 0 ||
        index >= questions.length
      ) return;
      setCurrentIndex(index);
    },
    [phase, questions.length, timerExpired],
  );

  const goNext = useCallback(() => {
    if (phase !== "active" || timerExpired) return;
    setCurrentIndex((index) => Math.min(index + 1, questions.length - 1));
  }, [phase, questions.length, timerExpired]);

  const goPrev = useCallback(() => {
    if (phase !== "active" || timerExpired) return;
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, [phase, timerExpired]);

  const submitCurrentDrill = useCallback(
    async (markUnknown: boolean) => {
      if (submittingRef.current) return;
      const question = questions[currentIndex];
      const current = answers[currentIndex];
      if (!question || !current) return;
      const answer = markUnknown ? null : normalizeSelectedAnswer(current.selectedAnswer);
      if (!markUnknown && answer === null) return;

      if (markUnknown) {
        setAnswers((previous) =>
          previous.map((item, index) =>
            index === currentIndex
              ? { ...item, selectedAnswer: null, uncertain: true }
              : item,
          ),
        );
      }

      submittingRef.current = true;
      setError(null);
      setPhase("submitting");
      try {
        const response = await fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: config.categoryId,
            questionId: question.id,
            answer,
          }),
        });
        const data: unknown = await readJson(response);
        if (!response.ok) throw requestError(data, "答え合わせに失敗しました。");
        if (!isAnswerResponse(data) || data.questionId !== question.id) {
          throw invalidResponseError("答え合わせ結果の形式が正しくありません。");
        }
        setDrillResults((previous) => ({ ...previous, [question.id]: data }));
        setPhase("feedback");
      } catch (cause) {
        const requestFailure = toRequestFailure(cause);
        setError({
          operation: "drill",
          kind: requestFailure.kind,
          message: requestFailure.message,
          recoverPhase: "active",
        });
        setPhase("error");
      } finally {
        submittingRef.current = false;
      }
    },
    [answers, config.categoryId, currentIndex, questions],
  );

  const submitDrill = useCallback(
    () => submitCurrentDrill(false),
    [submitCurrentDrill],
  );
  const submitUnknownDrill = useCallback(
    () => submitCurrentDrill(true),
    [submitCurrentDrill],
  );

  const nextDrill = useCallback(() => {
    if (phase !== "feedback") return;
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((index) => index + 1);
      setPhase("active");
      return;
    }

    const results = questions.flatMap((question, index) => {
      const response = drillResults[question.id];
      if (!response) return [];
      return [{
        questionId: question.id,
        userAnswer: normalizeSelectedAnswer(answers[index]?.selectedAnswer ?? null),
        correctAnswer: response.answer,
        score: response.score,
        explanation: response.explanation,
      }];
    });
    const totalPoints = results.reduce((sum, result) => sum + result.score, 0);
    const result: ExamResult = {
      attemptId,
      categoryId: config.categoryId,
      mode: "drill",
      finishReason: "drill-complete",
      passingScore: config.passingScore,
      results,
      totalScore: results.length > 0 ? Math.round((totalPoints / results.length) * 100) : 0,
      correctCount: results.filter((item) => item.score === 1).length,
      totalCount: questions.length,
      timestamp: new Date().toISOString(),
    };
    setCompletedResult(result);
    setPhase("finished");
  }, [
    answers,
    attemptId,
    config.categoryId,
    config.passingScore,
    currentIndex,
    drillResults,
    phase,
    questions,
  ]);

  const requestReview = useCallback(() => {
    if (config.mode === "exam" && phase === "active" && !timerExpired) {
      setPhase("review");
    }
  }, [config.mode, phase, timerExpired]);

  const resumeExam = useCallback(
    (index?: number) => {
      if (phase !== "review" || timerExpired) return;
      if (index !== undefined && index >= 0 && index < questions.length) {
        setCurrentIndex(index);
      }
      setPhase("active");
    },
    [phase, questions.length, timerExpired],
  );

  const finishExam = useCallback(
    async (reason: FinishReason = "manual") => {
      if (submittingRef.current || completedResult || config.mode !== "exam") return;
      submittingRef.current = true;
      setError(null);
      setPhase("submitting");
      try {
        const response = await fetch("/api/answers/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            categoryId: config.categoryId,
            answers: answers.map((answer, index) => ({
              questionId: questions[index]?.id ?? answer.questionId,
              answer: normalizeSelectedAnswer(answer.selectedAnswer),
            })),
          }),
        });
        const data: unknown = await readJson(response);
        if (!response.ok) throw requestError(data, "採点に失敗しました。");
        if (!isBatchAnswerResponse(data) || !matchesQuestions(data, questions)) {
          throw invalidResponseError("採点結果の形式が正しくありません。");
        }
        const order = new Map(questions.map((question, index) => [question.id, index]));
        const result: ExamResult = {
          attemptId,
          categoryId: config.categoryId,
          mode: "exam",
          finishReason: reason,
          passingScore: config.passingScore,
          results: [...data.results].sort(
            (left, right) =>
              (order.get(left.questionId) ?? Number.MAX_SAFE_INTEGER) -
              (order.get(right.questionId) ?? Number.MAX_SAFE_INTEGER),
          ),
          totalScore: data.totalScore,
          correctCount: data.correctCount,
          totalCount: data.totalCount,
          timestamp: new Date().toISOString(),
        };
        setCompletedResult(result);
        setPhase("finished");
      } catch (cause) {
        const requestFailure = toRequestFailure(cause);
        setError({
          operation: "submit",
          kind: requestFailure.kind,
          message: requestFailure.message,
          recoverPhase: reason === "manual" ? "review" : "active",
          finishReason: reason,
        });
        setPhase("error");
      } finally {
        submittingRef.current = false;
      }
    },
    [answers, attemptId, completedResult, config, questions],
  );

  useEffect(() => {
    if (
      remainingTime !== 0 ||
      config.mode !== "exam" ||
      (phase !== "active" && phase !== "review") ||
      autoSubmitStartedRef.current
    ) {
      return;
    }
    autoSubmitStartedRef.current = true;
    void finishExam("time-expired");
  }, [config.mode, finishExam, phase, remainingTime]);

  const retry = useCallback(async () => {
    if (!error) return;
    if (error.operation === "load") {
      await loadQuestions();
      return;
    }
    if (error.operation === "drill") {
      setPhase("active");
      await submitCurrentDrill(Boolean(answers[currentIndex]?.uncertain));
      return;
    }
    setPhase(error.recoverPhase);
    await finishExam(error.finishReason ?? "manual");
  }, [answers, currentIndex, error, finishExam, loadQuestions, submitCurrentDrill]);

  const abandonSession = useCallback(() => {
    clearSessionState();
  }, []);

  const currentQuestion = questions[currentIndex];
  const drillResult = currentQuestion ? drillResults[currentQuestion.id] ?? null : null;

  return {
    questions,
    answers,
    currentIndex,
    remainingTime,
    phase,
    error,
    drillResult,
    completedResult,
    scenarioMap,
    sourceMap,
    sourcePublisher,
    isLocked: timerExpired || phase === "submitting" || phase === "finished",
    setAnswer,
    toggleFlag,
    toggleUncertain,
    goTo,
    goNext,
    goPrev,
    submitDrill,
    submitUnknownDrill,
    nextDrill,
    requestReview,
    resumeExam,
    finishExam,
    retry,
    abandonSession,
  };
}

function restoreSession(
  state: SessionStateV2 | null,
  availableQuestions: PublicQuestion[],
  expectedCount: number,
): { state: SessionStateV2; questions: PublicQuestion[] } | null {
  if (!state || state.questionIds.length !== expectedCount) return null;
  if (state.answers.length !== state.questionIds.length) return null;
  const byId = new Map(availableQuestions.map((question) => [question.id, question]));
  const questions = state.questionIds.map((id) => byId.get(id));
  if (questions.some((question) => !question)) return null;
  if (
    state.answers.some(
      (answer, index) => answer.questionId !== state.questionIds[index],
    )
  ) {
    return null;
  }
  return { state, questions: questions as PublicQuestion[] };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function calculateRemainingTime(deadlineAt: number | null): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
}

function createAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type RequestFailure = Error & { kind: "network" | "invalid-response" };

function requestError(data: unknown, fallback: string): RequestFailure {
  const message =
    isRecord(data) && typeof data.error === "string" ? data.error : fallback;
  return Object.assign(new Error(message), { kind: "network" as const });
}

function invalidResponseError(message: string): RequestFailure {
  return Object.assign(new Error(message), { kind: "invalid-response" as const });
}

function toRequestFailure(cause: unknown): RequestFailure {
  if (cause instanceof Error && "kind" in cause) return cause as RequestFailure;
  return Object.assign(
    new Error(cause instanceof Error ? cause.message : "通信に失敗しました。"),
    { kind: "network" as const },
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw invalidResponseError("サーバーから正しい応答を受け取れませんでした。");
  }
}

function isQuestionsResponse(value: unknown): value is QuestionsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.questions) &&
    value.questions.every(isPublicQuestion) &&
    Array.isArray(value.scenarios) &&
    value.scenarios.every(isPublicScenario) &&
    Array.isArray(value.sources) &&
    (value.sourcePublisher === null || isRecord(value.sourcePublisher))
  );
}

function isPublicQuestion(value: unknown): value is PublicQuestion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.options) &&
    value.options.every((option) => typeof option === "string") &&
    (value.type === "single-choice" || value.type === "multiple-choice") &&
    (value.style === "oneshot" || value.style === "scenario")
  );
}

function isPublicScenario(value: unknown): value is PublicScenario {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.scenario === "string" &&
    Array.isArray(value.questions) &&
    value.questions.every(isPublicQuestion)
  );
}

function isAnswerResponse(value: unknown): value is AnswerResponse {
  return (
    isRecord(value) &&
    typeof value.questionId === "string" &&
    typeof value.correct === "boolean" &&
    isUnitScore(value.score) &&
    isCorrectAnswer(value.answer) &&
    typeof value.explanation === "string" &&
    value.correct === (value.score === 1)
  );
}

function isBatchAnswerResponse(value: unknown): value is BatchAnswerResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.results) &&
    value.results.every((result) =>
      isRecord(result) &&
      typeof result.questionId === "string" &&
      isSelectedAnswer(result.userAnswer) &&
      isCorrectAnswer(result.correctAnswer) &&
      isUnitScore(result.score) &&
      typeof result.explanation === "string",
    ) &&
    isFiniteNumber(value.totalScore) &&
    value.totalScore >= 0 &&
    value.totalScore <= 100 &&
    typeof value.correctCount === "number" &&
    Number.isInteger(value.correctCount) &&
    value.correctCount >= 0 &&
    typeof value.totalCount === "number" &&
    Number.isInteger(value.totalCount) &&
    value.totalCount >= 0
  );
}

function matchesQuestions(
  response: BatchAnswerResponse,
  questions: PublicQuestion[],
): boolean {
  if (
    response.totalCount !== questions.length ||
    response.results.length !== questions.length ||
    response.correctCount > response.totalCount
  ) return false;

  const expectedIds = new Set(questions.map((question) => question.id));
  const resultIds = new Set(response.results.map((result) => result.questionId));
  if (
    resultIds.size !== response.results.length ||
    [...resultIds].some((questionId) => !expectedIds.has(questionId))
  ) return false;

  const totalPoints = response.results.reduce((sum, result) => sum + result.score, 0);
  const expectedScore = Math.round((totalPoints / questions.length) * 100);
  const expectedCorrectCount = response.results.filter((result) => result.score === 1).length;
  return (
    response.totalScore === expectedScore &&
    response.correctCount === expectedCorrectCount
  );
}

function isSelectedAnswer(value: unknown): value is number | number[] | null {
  return value === null || isCorrectAnswer(value);
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

function isUnitScore(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
