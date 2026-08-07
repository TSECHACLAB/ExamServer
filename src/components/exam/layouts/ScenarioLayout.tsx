/**
 * 長文シナリオレイアウト
 *
 * PC: 左にシナリオ本文（スクロール可）/ 右に問題・選択肢 の左右分割。
 * スマホ: シナリオ本文を折りたたみ表示 / 下に問題・選択肢。
 */

"use client";

import type { PublicQuestion, PublicScenario, QuestionType } from "@/types/exam";
import ChoiceGroup from "@/components/exam/ChoiceGroup";
import MarkdownContent from "@/components/exam/MarkdownContent";
import {
  Disclosure,
  DisclosureSummary,
} from "@/vendor/dads-runtime/components/Disclosure";

interface Props {
  scenario: PublicScenario;
  question: PublicQuestion;
  selectedAnswer: number | number[] | null;
  onAnswer: (answer: number | number[]) => void;
  showResult?: {
    correctAnswer: number | number[];
    userAnswer: number | number[] | null;
  };
  disabled?: boolean;
}

export default function ScenarioLayout({
  scenario,
  question,
  selectedAnswer,
  onAnswer,
  showResult,
  disabled,
}: Props) {
  return (
    <>
      {/* ── PC: 左右分割 ── */}
      <div className="hidden md:grid md:min-h-[30rem] md:grid-cols-2 md:gap-6">
        {/* 左: シナリオ本文 */}
        <div className="max-h-[calc(100dvh-15rem)] overflow-auto rounded-8 border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-3 text-std-20B-150 text-solid-gray-900">
            {scenario.title}
          </h2>
          <MarkdownContent className="text-[var(--foreground)]">
            {scenario.scenario}
          </MarkdownContent>

          {/* シナリオ画像 */}
          {scenario.scenarioImages?.map((src) => (
            <div key={src} className="mt-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="シナリオ画像"
                className="max-w-full rounded-8 border border-[var(--border)]"
              />
            </div>
          ))}
        </div>

        {/* 右: 問題・選択肢 */}
        <div className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-5">
          <QuestionPanel
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswer={onAnswer}
            showResult={showResult}
            disabled={disabled}
          />
        </div>
      </div>

      {/* ── スマホ: 折りたたみ + 縦積み ── */}
      <div className="space-y-5 md:hidden">
        <Disclosure className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4">
          <DisclosureSummary className="font-bold text-solid-gray-900">
            {scenario.title}
          </DisclosureSummary>
          <div className="mt-4 max-h-[50vh] overflow-auto border-t border-[var(--border)] pt-4">
            <MarkdownContent className="text-[var(--foreground)]">
              {scenario.scenario}
            </MarkdownContent>
            {scenario.scenarioImages?.map((src) => (
              <div key={src} className="mt-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt="シナリオ画像"
                  className="max-w-full rounded-8 border border-[var(--border)]"
                />
              </div>
            ))}
          </div>
        </Disclosure>

        {/* 問題・選択肢 */}
        <div className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4">
          <QuestionPanel
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswer={onAnswer}
            showResult={showResult}
            disabled={disabled}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 問題パネル（PC / スマホ共用）
// ---------------------------------------------------------------------------

function QuestionPanel({
  question,
  selectedAnswer,
  onAnswer,
  showResult,
  disabled,
}: Omit<Props, "scenario">) {
  return (
    <div className="space-y-5">
      {/* 問題文 */}
      <MarkdownContent className="text-[var(--foreground)]">
        {question.text}
      </MarkdownContent>

      {/* 問題画像 */}
      {question.image && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.image}
            alt="問題画像"
            className="max-h-60 max-w-full rounded-8 border border-[var(--border)]"
          />
        </div>
      )}

      {/* 選択肢 */}
      <ChoiceGroup
        options={question.options}
        type={question.type as QuestionType}
        selectionLimit={question.selectionLimit}
        selectedAnswer={selectedAnswer}
        onChange={onAnswer}
        showResult={showResult}
        disabled={disabled}
        legend="この問題の回答"
      />
    </div>
  );
}
