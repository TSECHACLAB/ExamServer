"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AbandonSessionDialog from "@/components/exam/AbandonSessionDialog";
import DrillFeedback from "@/components/exam/DrillFeedback";
import ExamReview from "@/components/exam/ExamReview";
import ExamSessionStatus from "@/components/exam/ExamSessionStatus";
import ExamShell from "@/components/exam/ExamShell";
import OneshotLayout from "@/components/exam/layouts/OneshotLayout";
import ScenarioLayout from "@/components/exam/layouts/ScenarioLayout";
import ResultView from "@/components/exam/ResultView";
import { useExamSession } from "@/hooks/useExamSession";
import { isAnswered } from "@/lib/answer-state";
import type { Category, NormalizedExamSessionConfig } from "@/types/exam";

interface Props {
  category: Category;
  config: NormalizedExamSessionConfig;
}

export default function ExamSession({ category, config }: Props) {
  const router = useRouter();
  const [abandonOpen, setAbandonOpen] = useState(false);
  const session = useExamSession(config);
  const setupHref = `/exam/${category.id}?bucket=${config.returnBucket}`;

  if (session.phase === "loading") {
    return (
      <ExamSessionStatus
        categoryName={category.name}
        loadingLabel="問題を読み込んでいます"
        setupHref={setupHref}
      />
    );
  }

  if (session.phase === "submitting") {
    return (
      <ExamSessionStatus
        categoryName={category.name}
        loadingLabel={config.mode === "exam" ? "採点しています" : "答え合わせをしています"}
        setupHref={setupHref}
      />
    );
  }

  if (session.phase === "error" && session.error) {
    return (
      <ExamSessionStatus
        categoryName={category.name}
        error={session.error}
        onRetry={() => void session.retry()}
        setupHref={setupHref}
      />
    );
  }

  if (session.phase === "finished" && session.completedResult) {
    return (
      <ResultView
        categoryName={category.name}
        result={session.completedResult}
        questions={session.questions}
        sourceMap={session.sourceMap}
        sourcePublisher={session.sourcePublisher}
        returnBucket={config.returnBucket}
      />
    );
  }

  if (session.phase === "review") {
    return (
      <ExamReview
        answers={session.answers}
        categoryName={category.name}
        currentIndex={session.currentIndex}
        passingScore={config.passingScore}
        remainingTime={session.remainingTime}
        isLocked={session.isLocked}
        onReturn={session.resumeExam}
        onSubmit={() => void session.finishExam("manual")}
      />
    );
  }

  const currentQuestion = session.questions[session.currentIndex];
  const currentAnswer = session.answers[session.currentIndex];
  if (!currentQuestion || !currentAnswer) {
    return (
      <ExamSessionStatus
        categoryName={category.name}
        error={{
          operation: "load",
          kind: "empty",
          message: "表示できる問題がありません。設定を確認してください。",
          recoverPhase: "active",
        }}
        setupHref={setupHref}
      />
    );
  }

  const isScenario = currentQuestion.style === "scenario";
  const parentScenario = isScenario ? session.scenarioMap[currentQuestion.id] : null;
  const showingFeedback = session.phase === "feedback" && session.drillResult !== null;
  const resultProps = session.drillResult
    ? {
        correctAnswer: session.drillResult.answer,
        userAnswer: currentAnswer.selectedAnswer,
      }
    : undefined;

  const handlePrimary = () => {
    if (config.mode === "exam") {
      if (session.currentIndex === session.questions.length - 1) session.requestReview();
      else session.goNext();
      return;
    }
    if (showingFeedback) session.nextDrill();
    else void session.submitDrill();
  };

  const primaryLabel =
    config.mode === "exam"
      ? session.currentIndex === session.questions.length - 1
        ? "回答状況を確認"
        : "次へ"
      : showingFeedback
        ? session.currentIndex === session.questions.length - 1
          ? "結果を見る"
          : "次の問題へ"
        : "答え合わせ";

  return (
    <>
      <ExamShell
        categoryName={category.name}
        mode={config.mode}
        currentIndex={session.currentIndex}
        totalCount={session.questions.length}
        answers={session.answers}
        remainingTime={session.remainingTime}
        isFlagged={currentAnswer.flagged}
        isUncertain={currentAnswer.uncertain}
        isScenario={isScenario}
        isLocked={session.isLocked}
        showingFeedback={showingFeedback}
        primaryLabel={primaryLabel}
        primaryDisabled={
          config.mode === "drill" &&
          !showingFeedback &&
          !isAnswered(currentAnswer.selectedAnswer)
        }
        onFlag={session.toggleFlag}
        onUncertain={() => {
          if (config.mode === "drill") void session.submitUnknownDrill();
          else session.toggleUncertain();
        }}
        onPrev={session.goPrev}
        onPrimary={handlePrimary}
        onNavigate={session.goTo}
        onReview={session.requestReview}
        onExit={() => setAbandonOpen(true)}
      >
        {isScenario && parentScenario ? (
          <ScenarioLayout
            scenario={parentScenario}
            question={currentQuestion}
            selectedAnswer={currentAnswer.selectedAnswer}
            onAnswer={session.setAnswer}
            showResult={resultProps}
            disabled={session.isLocked || showingFeedback}
          />
        ) : (
          <OneshotLayout
            question={currentQuestion}
            selectedAnswer={currentAnswer.selectedAnswer}
            onAnswer={session.setAnswer}
            showResult={resultProps}
            disabled={session.isLocked || showingFeedback}
          />
        )}

        {showingFeedback && session.drillResult ? (
          <DrillFeedback
            result={session.drillResult}
            sourceReference={currentQuestion.source}
            additionalSourceReferences={currentQuestion.sourceOccurrences}
            source={
              currentQuestion.source
                ? session.sourceMap[currentQuestion.source.sourceId]
                : undefined
            }
            sourceMap={session.sourceMap}
            publisher={session.sourcePublisher}
          />
        ) : null}
      </ExamShell>

      <AbandonSessionDialog
        open={abandonOpen}
        onClose={() => setAbandonOpen(false)}
        onConfirm={() => {
          session.abandonSession();
          router.push(setupHref);
        }}
      />
    </>
  );
}
