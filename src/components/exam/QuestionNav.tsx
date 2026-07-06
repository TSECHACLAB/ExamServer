/**
 * 問題ナビゲーション
 * 画面下部に問題番号を並べ、回答済み・フラグ付きを色分け表示する。
 */

"use client";

import type { AnswerState } from "@/types/exam";

interface Props {
  answers: AnswerState[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

export default function QuestionNav({
  answers,
  currentIndex,
  onNavigate,
}: Props) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {answers.map((ans, index) => {
        const isCurrent = index === currentIndex;
        const isAnswered = ans.selectedAnswer !== null;
        const isFlagged = ans.flagged;
        const isDontKnow = ans.dontKnow;
        const label = isDontKnow ? "？" : isFlagged ? "⚑" : index + 1;

        return (
          <button
            key={ans.questionId}
            onClick={() => onNavigate(index)}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`問${index + 1}${isDontKnow ? " 分からない" : ""}${isFlagged ? " フラグ" : ""}${isAnswered ? " 回答済み" : ""}`}
            className={`
              h-9 w-9 rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600
              ${isAnswered ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}
              ${isDontKnow ? "border border-sky-300 bg-sky-50 text-sky-800" : ""}
              ${isCurrent ? "outline outline-2 outline-offset-2 outline-blue-500" : ""}
              ${isFlagged ? "border border-amber-400" : ""}
              hover:bg-blue-50 hover:text-blue-800
            `}
            title={`問${index + 1}${isDontKnow ? " (分からない)" : ""}${isFlagged ? " (フラグ)" : ""}${isAnswered ? " (回答済)" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
