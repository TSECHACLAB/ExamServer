"use client";

import { useEffect } from "react";
import { DadsButtonLink } from "@/components/dads/DadsButton";
import { DadsLink } from "@/components/dads/DadsLink";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import MarkdownContent from "@/components/exam/MarkdownContent";
import QuestionSourceCitation from "@/components/exam/QuestionSourceCitation";
import {
  Disclosure,
  DisclosureSummary,
} from "@/vendor/dads-runtime/components/Disclosure";
import { Divider } from "@/vendor/dads-runtime/components/Divider";
import { Heading, HeadingTitle } from "@/vendor/dads-runtime/components/Heading";
import { isAnswered } from "@/lib/answer-state";
import { saveExamResult } from "@/lib/storage";
import type { CategoryBucket } from "@/components/CategorySelector";
import type {
  ExamResult,
  PublicQuestion,
  QuestionResult,
  QuestionSourcePublisher,
  PublicQuestionSourceSet,
} from "@/types/exam";

interface Props {
  categoryName: string;
  result: ExamResult;
  questions: PublicQuestion[];
  sourceMap: Record<string, PublicQuestionSourceSet>;
  sourcePublisher: QuestionSourcePublisher | null;
  returnBucket: CategoryBucket;
}

export default function ResultView({
  categoryName,
  result,
  questions,
  sourceMap,
  sourcePublisher,
  returnBucket,
}: Props) {
  useEffect(() => {
    saveExamResult(result);
  }, [result]);

  const passed = result.totalScore >= result.passingScore;
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const setupHref = `/exam/${result.categoryId}?bucket=${returnBucket}`;

  return (
    <main className="practice-dads-surface min-h-svh bg-[var(--background)] px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 font-bold text-solid-gray-700">
          {categoryName}・{result.mode === "exam" ? "試験モード" : "一問一答"}
        </p>
        <Heading size="36">
          <HeadingTitle level="h1">演習結果</HeadingTitle>
        </Heading>

        <section aria-labelledby="result-summary" className="mt-8">
          <DadsStatusBanner
            title={passed ? "○ 合格" : "× 基準未達"}
            type={passed ? "success" : "warning"}
            live="polite"
          >
            <p id="result-summary">
              得点は{result.totalScore}%、合格基準は{result.passingScore}%です。
            </p>
            {result.finishReason === "time-expired" ? (
              <p className="mt-2">制限時間が終了した時点の回答で自動採点しました。</p>
            ) : null}
          </DadsStatusBanner>

          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <ResultMetric label="得点" value={`${result.totalScore}%`} />
            <ResultMetric label="合格基準" value={`${result.passingScore}%`} />
            <ResultMetric
              label="完全正解"
              value={`${result.correctCount} / ${result.totalCount}問`}
            />
          </dl>
        </section>

        <Divider color="gray-420" className="my-9" />

        <section aria-labelledby="question-results-title">
          <h2 id="question-results-title" className="text-std-28B-150 text-solid-gray-900">
            問題別の結果
          </h2>
          <p className="mt-2 text-solid-gray-700">
            各問題を開くと、回答、正解、解説、出典を確認できます。
          </p>

          <div className="mt-6 grid gap-4">
            {result.results.map((item, index) => {
              const question = questionMap.get(item.questionId);
              if (!question) return null;
              const status = resultStatus(item);
              return (
                <Disclosure
                  key={item.questionId}
                  className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
                >
                  <DisclosureSummary className="w-full text-left font-bold text-solid-gray-900">
                    <span className="grid w-full gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
                      <span>{status.symbol} 問{index + 1}・{status.label}</span>
                      <span className="font-normal">
                        {plainText(question.text).slice(0, 72)}
                      </span>
                    </span>
                  </DisclosureSummary>
                  <div className="ml-8 mt-5 space-y-5 border-t border-[var(--border)] pt-5">
                    <MarkdownContent className="text-[var(--foreground)]">
                      {question.text}
                    </MarkdownContent>
                    <AnswerDetails question={question} result={item} />
                    <div className="rounded-8 border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                      <h3 className="mb-2 font-bold text-solid-gray-900">解説</h3>
                      <MarkdownContent className="text-[var(--foreground)]">
                        {item.explanation}
                      </MarkdownContent>
                    </div>
                    <QuestionSourceCitation
                      reference={question.source}
                      additionalReferences={question.sourceOccurrences}
                      sourceMap={sourceMap}
                      source={question.source ? sourceMap[question.source.sourceId] : undefined}
                      publisher={sourcePublisher}
                    />
                  </div>
                </Disclosure>
              );
            })}
          </div>
        </section>

        <Divider color="gray-420" className="my-9" />

        <nav aria-label="結果画面の操作" className="flex flex-wrap items-center gap-4">
          <DadsButtonLink href={setupHref} size="lg" variant="solid-fill">
            もう一度挑戦
          </DadsButtonLink>
          <DadsLink href="/">演習選択に戻る</DadsLink>
        </nav>
      </div>
    </main>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-solid-gray-700">{label}</dt>
      <dd className="mt-1 text-std-28B-150 text-solid-gray-900">{value}</dd>
    </div>
  );
}

function AnswerDetails({
  question,
  result,
}: {
  question: PublicQuestion;
  result: QuestionResult;
}) {
  const correct = new Set(
    Array.isArray(result.correctAnswer) ? result.correctAnswer : [result.correctAnswer],
  );
  const selected = new Set(
    result.userAnswer === null
      ? []
      : Array.isArray(result.userAnswer)
        ? result.userAnswer
        : [result.userAnswer],
  );
  return (
    <div>
      <h3 className="font-bold text-solid-gray-900">回答と正解</h3>
      {!isAnswered(result.userAnswer) ? (
        <p className="mt-2 font-bold text-error-1">未回答</p>
      ) : null}
      <ul className="mt-2 grid gap-2">
        {question.options.map((option, index) => {
          const isCorrectOption = correct.has(index);
          const isSelectedOption = selected.has(index);
          const marker = isCorrectOption && isSelectedOption
            ? "○ 正解として選択"
            : !isCorrectOption && isSelectedOption
              ? "× 不正解を選択"
              : isCorrectOption
                ? "→ 正解（未選択）"
                : "・未選択";
          return (
            <li
              key={index}
              className={`rounded-6 border px-3 py-2 ${
                isCorrectOption
                  ? "border-success-1"
                  : isSelectedOption
                    ? "border-error-1"
                    : "border-[var(--border)]"
              }`}
            >
              <span className="font-bold">{marker}</span> {option}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function resultStatus(result: QuestionResult): { label: string; symbol: string } {
  if (!isAnswered(result.userAnswer)) return { label: "未回答", symbol: "－" };
  if (result.score === 1) return { label: "正解", symbol: "○" };
  if (result.score > 0) return { label: "部分正解", symbol: "△" };
  return { label: "不正解", symbol: "×" };
}

function plainText(value: string): string {
  return value.replace(/[#*`_]/g, "").replace(/\s+/g, " ").trim();
}
