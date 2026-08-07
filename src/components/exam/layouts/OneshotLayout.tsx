/**
 * 一問一答レイアウト
 * 上: 問題文 / 下: 選択肢の縦積みレイアウト。PC・スマホ共通。
 */

"use client";

import type { PublicQuestion, QuestionType } from "@/types/exam";
import ChoiceGroup from "@/components/exam/ChoiceGroup";
import MarkdownContent from "@/components/exam/MarkdownContent";

interface Props {
  question: PublicQuestion;
  selectedAnswer: number | number[] | null;
  onAnswer: (answer: number | number[]) => void;
  /** 正解表示時に渡す */
  showResult?: {
    correctAnswer: number | number[];
    userAnswer: number | number[] | null;
  };
  disabled?: boolean;
}

export default function OneshotLayout({
  question,
  selectedAnswer,
  onAnswer,
  showResult,
  disabled,
}: Props) {
  return (
    <article className="space-y-7 rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-7">
      {/* 問題文 */}
      <MarkdownContent className="text-[var(--foreground)]">
        {question.text}
      </MarkdownContent>

      {/* 画像（ある場合） */}
      {question.image && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.image}
            alt="問題画像"
            className="max-h-80 max-w-full rounded-8 border border-[var(--border)]"
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
    </article>
  );
}
