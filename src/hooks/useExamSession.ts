/**
 * 受験セッションのカスタムフック
 *
 * 問題の読み込み、回答状態の管理、タイマー、採点リクエストを一元管理する。
 * localStorage を利用してブラウザリロード時に回答状態を復帰できる。
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PublicQuestion,
  PublicScenario,
  AnswerState,
  ExamMode,
  AnswerResponse,
  BatchAnswerResponse,
} from "@/types/exam";
import {
  applyAnswerSelection,
  createEmptyAnswerState,
  markDontKnow,
  normalizeAnswerState,
  toggleDontKnow,
} from "@/lib/answer-state";

// ---------------------------------------------------------------------------
// localStorage による状態復帰キー
// ---------------------------------------------------------------------------
const SESSION_KEY = "exam-session-state";

interface SessionState {
  categoryId: string;
  questionIds: string[];
  answers: AnswerState[];
  currentIndex: number;
  remainingTime: number | null;
}

// ---------------------------------------------------------------------------
// フックのインターフェース
// ---------------------------------------------------------------------------

interface UseExamSessionOptions {
  categoryId: string;
  mode: ExamMode;
  questionCount: number;
  timerEnabled: boolean;
  randomEnabled: boolean;
  selectedDomains: string[];
  timeLimit: number;
}

interface ExamSessionState {
  /** 問題一覧（正解なし） */
  questions: PublicQuestion[];
  /** 回答状態 */
  answers: AnswerState[];
  /** 現在の問題インデックス */
  currentIndex: number;
  /** タイマー残り秒数（null=タイマー無効） */
  remainingTime: number | null;
  /** 読み込み中 */
  loading: boolean;
  /** 一問一答モードで表示中の結果 */
  drillResult: AnswerResponse | null;
  /** 試験が終了したか */
  finished: boolean;
  /** 一括採点結果 */
  batchResult: BatchAnswerResponse | null;
  /** 問題IDからシナリオを引くマップ（シナリオ問題のみ） */
  scenarioMap: Record<string, PublicScenario>;
}

interface ExamSessionActions {
  setAnswer: (answer: number | number[]) => void;
  toggleFlag: () => void;
  toggleDontKnow: () => void;
  goTo: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
  /** 一問一答で回答を送信 */
  submitDrill: () => Promise<void>;
  /** 一問一答で未回答として正解・解説を表示 */
  submitUnknownDrill: () => Promise<void>;
  /** 一問一答で次の問題へ */
  nextDrill: () => void;
  /** 本番モードで試験を終了・一括採点 */
  finishExam: () => Promise<void>;
  /** 採点せずにセッションを破棄 */
  abandonSession: () => void;
}

export function useExamSession(
  options: UseExamSessionOptions
): ExamSessionState & ExamSessionActions {
  const {
    categoryId,
    questionCount,
    timerEnabled,
    randomEnabled,
    selectedDomains,
    timeLimit,
  } = options;

  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<AnswerState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillResult, setDrillResult] = useState<AnswerResponse | null>(null);
  const [finished, setFinished] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchAnswerResponse | null>(
    null
  );
  const [scenarioMap, setScenarioMap] = useState<
    Record<string, PublicScenario>
  >({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTimer = remainingTime !== null;

  // ---------------------------------------------------------------------------
  // 問題データ読み込み
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchQuestions = async () => {
      const res = await fetch(`/api/questions?categoryId=${categoryId}`);
      const data = await res.json();

      // 問題IDからシナリオを引くマップを構築
      const sMap: Record<string, PublicScenario> = {};
      if (data.scenarios) {
        for (const scenario of data.scenarios as PublicScenario[]) {
          for (const q of scenario.questions) {
            sMap[q.id] = scenario;
          }
        }
      }
      setScenarioMap(sMap);

      // oneshot問題 → scenario問題の順で結合
      let allQuestions: PublicQuestion[] = [...(data.questions || [])];
      if (data.scenarios) {
        for (const scenario of data.scenarios) {
          allQuestions = [...allQuestions, ...scenario.questions];
        }
      }
      if (selectedDomains.length > 0) {
        allQuestions = allQuestions.filter((question) =>
          question.domain ? selectedDomains.includes(question.domain) : false
        );
      }

      const saved = loadSessionState();
      const restoredQuestions = restoreSavedQuestionOrder(
        saved,
        categoryId,
        allQuestions,
        questionCount
      );

      // ランダム出題（問題数指定時）
      if (restoredQuestions) {
        allQuestions = restoredQuestions;
      } else {
        if (randomEnabled) {
          allQuestions = shuffle(allQuestions);
        }
        if (questionCount < allQuestions.length) {
          allQuestions = allQuestions.slice(0, questionCount);
        }
      }

      // localStorage から復帰を試みる。
      // カテゴリやランダム出題順が違うセッションを復帰すると、
      // 表示中の選択肢と採点対象 questionId がズレるため、問題ID列まで一致させる。
      if (isRestorableSession(saved, categoryId, allQuestions)) {
        setAnswers(normalizeSavedAnswers(saved.answers));
        setCurrentIndex(Math.min(saved.currentIndex, allQuestions.length - 1));
        setRemainingTime(saved.remainingTime);
      } else {
        const initialAnswers: AnswerState[] = allQuestions.map((q) =>
          createEmptyAnswerState(q.id)
        );
        setAnswers(initialAnswers);
        setRemainingTime(timerEnabled ? timeLimit : null);
      }

      setQuestions(allQuestions);
      setLoading(false);
    };

    fetchQuestions();
  }, [categoryId, questionCount, randomEnabled, selectedDomains, timerEnabled, timeLimit]);

  // ---------------------------------------------------------------------------
  // タイマー
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasTimer || finished) return;

    timerRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev === null || prev <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasTimer, finished]);

  // ---------------------------------------------------------------------------
  // localStorage への保存（回答変更時）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (answers.length === 0) return;
    saveSessionState({
      categoryId,
      questionIds: questions.map((q) => q.id),
      answers,
      currentIndex,
      remainingTime,
    });
  }, [categoryId, questions, answers, currentIndex, remainingTime]);

  // ---------------------------------------------------------------------------
  // ブラウザ離脱警告
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (finished) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [finished]);

  // ---------------------------------------------------------------------------
  // アクション
  // ---------------------------------------------------------------------------

  const setAnswer = useCallback(
    (answer: number | number[]) => {
      setAnswers((prev) =>
        prev.map((a, i) =>
          i === currentIndex ? applyAnswerSelection(a, answer) : a
        )
      );
      // 一問一答で結果表示中に回答を変えたらリセット
      setDrillResult(null);
    },
    [currentIndex]
  );

  const toggleFlag = useCallback(() => {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === currentIndex ? { ...a, flagged: !a.flagged } : a
      )
    );
  }, [currentIndex]);

  const toggleDontKnowAction = useCallback(() => {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === currentIndex
          ? toggleDontKnow(a)
          : a
      )
    );
    setDrillResult(null);
  }, [currentIndex]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setDrillResult(null);
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
    setDrillResult(null);
  }, [questions.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    setDrillResult(null);
  }, []);

  /** 一問一答: 回答を送信して即座に結果を取得 */
  const submitDrill = useCallback(async () => {
    const currentQuestion = questions[currentIndex];
    const current = answers[currentIndex];
    if (!currentQuestion || !current || current.selectedAnswer === null) return;

    const questionId = currentQuestion.id;
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        questionId,
        answer: current.selectedAnswer,
      }),
    });
    const data = (await res.json()) as AnswerResponse;
    setDrillResult({ ...data, questionId: data.questionId ?? questionId });
  }, [categoryId, questions, answers, currentIndex]);

  /** 一問一答: 未回答として正解と解説を取得 */
  const submitUnknownDrill = useCallback(async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    setAnswers((prev) =>
      prev.map((a, i) =>
        i === currentIndex
          ? markDontKnow(a)
          : a
      )
    );

    const questionId = currentQuestion.id;
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        questionId,
        answer: null,
      }),
    });
    const data = (await res.json()) as AnswerResponse;
    setDrillResult({ ...data, questionId: data.questionId ?? questionId });
  }, [categoryId, questions, currentIndex]);

  /** 一問一答: 結果を閉じて次へ */
  const nextDrill = useCallback(() => {
    setDrillResult(null);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setFinished(true);
    }
  }, [currentIndex, questions.length]);

  /** 本番モード: 一括採点 */
  const finishExam = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const res = await fetch("/api/answers/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        answers: answers.map((a, index) => ({
          questionId: questions[index]?.id ?? a.questionId,
          answer: a.dontKnow ? null : a.selectedAnswer,
          dontKnow: a.dontKnow,
        })),
      }),
    });
    const data = (await res.json()) as BatchAnswerResponse;
    const resultOrder = new Map(
      questions.map((question, index) => [question.id, index])
    );
    const orderedResults = [...data.results].sort(
      (a, b) =>
        (resultOrder.get(a.questionId) ?? Number.MAX_SAFE_INTEGER) -
        (resultOrder.get(b.questionId) ?? Number.MAX_SAFE_INTEGER)
    );
    setBatchResult({ ...data, results: orderedResults });
    setFinished(true);
    clearSessionState();
  }, [categoryId, questions, answers]);

  const abandonSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    clearSessionState();
    setFinished(true);
  }, []);

  return {
    questions,
    answers,
    currentIndex,
    remainingTime,
    loading,
    drillResult,
    finished,
    batchResult,
    scenarioMap,
    setAnswer,
    toggleFlag,
    toggleDontKnow: toggleDontKnowAction,
    goTo,
    goNext,
    goPrev,
    submitDrill,
    submitUnknownDrill,
    nextDrill,
    finishExam,
    abandonSession,
  };
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** 配列をシャッフル（Fisher-Yates） */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadSessionState(): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeSavedAnswers(answers: AnswerState[]): AnswerState[] {
  return answers.map((answer) => normalizeAnswerState(answer));
}

function isRestorableSession(
  saved: SessionState | null,
  categoryId: string,
  questions: PublicQuestion[]
): saved is SessionState {
  if (!saved) return false;
  if (saved.categoryId !== categoryId) return false;
  if (saved.answers.length !== questions.length) return false;
  if (saved.questionIds.length !== questions.length) return false;

  return questions.every((question, index) => {
    return (
      saved.questionIds[index] === question.id &&
      saved.answers[index]?.questionId === question.id
    );
  });
}

function restoreSavedQuestionOrder(
  saved: SessionState | null,
  categoryId: string,
  questions: PublicQuestion[],
  questionCount: number
): PublicQuestion[] | null {
  if (!saved) return null;
  if (saved.categoryId !== categoryId) return null;
  const expectedCount = Math.min(questionCount, questions.length);
  if (saved.questionIds.length !== expectedCount) return null;

  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const restored = saved.questionIds.map((id) => questionsById.get(id));
  if (restored.some((question) => !question)) return null;

  return restored as PublicQuestion[];
}

function saveSessionState(state: SessionState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

function clearSessionState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
