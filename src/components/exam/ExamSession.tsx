/**
 * 受験セッション
 * useExamSession フックで状態管理し、モードに応じた表示を切り替える。
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamMode, Category } from "@/types/exam";
import type { CategoryBucket } from "@/components/CategorySelector";
import { useExamSession } from "@/hooks/useExamSession";
import ExamShell from "@/components/exam/ExamShell";
import OneshotLayout from "@/components/exam/layouts/OneshotLayout";
import ScenarioLayout from "@/components/exam/layouts/ScenarioLayout";
import DrillFeedback from "@/components/exam/DrillFeedback";
import ResultView from "@/components/exam/ResultView";

interface Props {
  categoryId: string;
  mode: ExamMode;
  questionCount: number;
  timerEnabled: boolean;
  randomEnabled: boolean;
  selectedDomains: string[];
  returnBucket: CategoryBucket | null;
}

export default function ExamSession({
  categoryId,
  mode,
  questionCount,
  timerEnabled,
  randomEnabled,
  selectedDomains,
  returnBucket,
}: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<Category | null>(null);

  // カテゴリ情報を取得（サーバーから）
  useEffect(() => {
    fetch(`/api/categories?id=${categoryId}`)
      .then((res) => res.json())
      .then((data) => setCategory(data))
      .catch(() => {});
  }, [categoryId]);

  const session = useExamSession({
    categoryId,
    mode,
    questionCount,
    timerEnabled,
    randomEnabled,
    selectedDomains,
    timeLimit: category?.timeLimit ?? 5400,
  });

  const effectiveReturnBucket =
    returnBucket ??
    (category?.group === "certification" ? "certification" : "other");
  const setupHref = `/exam/${categoryId}?bucket=${effectiveReturnBucket}`;

  // ローディング中
  if (session.loading || !category) {
    return (
      <div className="exam-production-surface flex min-h-screen items-center justify-center">
        <p className="text-gray-500">問題を読み込み中...</p>
      </div>
    );
  }

  // 問題がない
  if (session.questions.length === 0) {
    return (
      <div className="exam-production-surface flex min-h-screen items-center justify-center">
        <p className="text-gray-500">この試験には問題がありません。</p>
      </div>
    );
  }

  // 試験終了 → 結果表示
  if (session.finished && session.batchResult) {
    return (
      <ResultView
        categoryId={categoryId}
        categoryName={category.name}
        mode={mode}
        result={session.batchResult}
        questions={session.questions}
        returnBucket={effectiveReturnBucket}
      />
    );
  }

  // 一問一答モードで全問完了
  if (session.finished && mode === "drill") {
    return (
      <div className="exam-production-surface flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold text-gray-800">
          全問完了しました！
        </p>
        <a
          href={setupHref}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          設定画面に戻る
        </a>
      </div>
    );
  }

  const currentQuestion = session.questions[session.currentIndex];
  const currentAnswer = session.answers[session.currentIndex];
  const isScenario = currentQuestion.style === "scenario";
  const parentScenario = isScenario
    ? session.scenarioMap[currentQuestion.id]
    : null;
  const currentDrillResult =
    session.drillResult?.questionId === currentQuestion.id
      ? session.drillResult
      : null;

  const resultProps = currentDrillResult
    ? {
        correctAnswer: currentDrillResult.answer,
        userAnswer: currentAnswer.selectedAnswer,
      }
    : undefined;
  const handlePrimaryNext = () => {
    if (mode !== "drill") {
      session.goNext();
      return;
    }

    if (currentDrillResult) {
      session.nextDrill();
      return;
    }

    if (currentAnswer.selectedAnswer === null) {
      void session.submitUnknownDrill();
      return;
    }

    void session.submitDrill();
  };
  const handlePrimaryFinish = () => {
    if (mode !== "drill") {
      void session.finishExam();
      return;
    }

    if (currentDrillResult) {
      session.nextDrill();
      return;
    }

    if (currentAnswer.selectedAnswer === null) {
      void session.submitUnknownDrill();
      return;
    }

    void session.submitDrill();
  };
  const handleExitExam = async () => {
    const confirmed = window.confirm(
      mode === "exam"
        ? "試験を終了して採点しますか？未回答の問題は未回答として扱われます。"
        : "一問一答を終了して設定画面に戻りますか？"
    );
    if (!confirmed) return;

    if (mode === "exam") {
      await session.finishExam();
      return;
    }

    session.abandonSession();
    router.push(setupHref);
  };
  const handleDontKnow = async () => {
    if (currentDrillResult) return;

    if (mode === "drill") {
      await session.submitUnknownDrill();
      return;
    }

    session.toggleDontKnow();
  };

  return (
    <ExamShell
      categoryName={category.name}
      currentIndex={session.currentIndex}
      totalCount={session.questions.length}
      answers={session.answers}
      remainingTime={session.remainingTime}
      isFlagged={currentAnswer.flagged}
      isDontKnow={currentAnswer.dontKnow}
      isScenario={isScenario}
      onFlag={session.toggleFlag}
      onDontKnow={handleDontKnow}
      onPrev={session.goPrev}
      onNext={handlePrimaryNext}
      onNavigate={session.goTo}
      onFinish={handlePrimaryFinish}
      onExit={handleExitExam}
    >
      {/* style に応じてレイアウトを切り替え */}
      {isScenario && parentScenario ? (
        <ScenarioLayout
          scenario={parentScenario}
          question={currentQuestion}
          selectedAnswer={currentAnswer.selectedAnswer}
          onAnswer={session.setAnswer}
          showResult={resultProps}
          disabled={currentDrillResult !== null}
        />
      ) : (
        <OneshotLayout
          question={currentQuestion}
          selectedAnswer={currentAnswer.selectedAnswer}
          onAnswer={session.setAnswer}
          showResult={resultProps}
          disabled={currentDrillResult !== null}
        />
      )}

      {/* 一問一答モードのフィードバック表示 */}
      {mode === "drill" && currentDrillResult && (
        <DrillFeedback
          result={currentDrillResult}
          onNext={session.nextDrill}
        />
      )}
    </ExamShell>
  );
}
