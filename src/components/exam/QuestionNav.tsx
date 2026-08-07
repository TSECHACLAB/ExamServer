"use client";

import { isAnswered } from "@/lib/answer-state";
import type { AnswerState } from "@/types/exam";

interface Props {
  answers: AnswerState[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  disabled?: boolean;
}

export default function QuestionNav({
  answers,
  currentIndex,
  onNavigate,
  disabled = false,
}: Props) {
  return (
    <ol className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-4">
      {answers.map((answer, index) => {
        const current = index === currentIndex;
        const answered = isAnswered(answer.selectedAnswer);
        const markers = [
          answered ? "回答済み" : "未回答",
          answer.uncertain ? "分からない" : null,
          answer.flagged ? "見直し対象" : null,
          current ? "現在の問題" : null,
        ].filter(Boolean);

        return (
          <li key={answer.questionId}>
            <button
              type="button"
              onClick={() => onNavigate(index)}
              disabled={disabled}
              aria-current={current ? "step" : undefined}
              aria-label={`問${index + 1} ${markers.join("、")}`}
              className={`flex min-h-12 w-full min-w-11 flex-col items-center justify-center rounded-6 border-2 px-1 py-1 text-sm font-bold forced-colors:border-[ButtonText] focus-visible:bg-yellow-300 focus-visible:text-blue-1000 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300 ${
                answered
                  ? "border-key-900 bg-[var(--primary-soft)] text-solid-gray-900"
                  : "border-[var(--border-strong)] bg-[var(--surface)] text-solid-gray-800"
              } ${current ? "border-key-900 shadow-[inset_0_-3px_0_var(--primary)]" : ""} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span>問{index + 1}</span>
              <span aria-hidden="true" className="text-[0.6875rem] leading-4">
                {current ? "今・" : ""}{answer.uncertain ? "？" : answered ? "済" : "未"}
                {answer.flagged ? "・旗" : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
