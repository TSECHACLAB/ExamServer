/**
 * 選択肢コンポーネント
 * 2〜10択対応。単一選択はラジオ、複数選択はチェックボックスで表示する。
 */

"use client";

import type { QuestionType } from "@/types/exam";

interface Props {
  options: string[];
  type: QuestionType;
  selectionLimit?: number;
  selectedAnswer: number | number[] | null;
  onChange: (answer: number | number[]) => void;
  /** 正解表示モード（一問一答で答え合わせ後に使用） */
  showResult?: {
    correctAnswer: number | number[];
    userAnswer: number | number[] | null;
  };
  disabled?: boolean;
}

export default function ChoiceGroup({
  options,
  type,
  selectionLimit,
  selectedAnswer,
  onChange,
  showResult,
  disabled = false,
}: Props) {
  const isSingle = type === "single-choice";

  const handleSelect = (index: number) => {
    if (disabled) return;

    if (isSingle) {
      onChange(index);
    } else {
      // 複数選択: トグル
      const current = Array.isArray(selectedAnswer) ? selectedAnswer : [];
      if (
        !current.includes(index) &&
        selectionLimit !== undefined &&
        current.length >= selectionLimit
      ) {
        return;
      }
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index];
      onChange(next);
    }
  };

  /** 選択肢ごとの表示状態を判定 */
  const getOptionState = (
    index: number
  ): "correct" | "wrong" | "missed" | "neutral" => {
    if (!showResult) return "neutral";

    const correctSet = new Set(
      Array.isArray(showResult.correctAnswer)
        ? showResult.correctAnswer
        : [showResult.correctAnswer]
    );
    const userSet = new Set(
      showResult.userAnswer === null
        ? []
        : Array.isArray(showResult.userAnswer)
          ? showResult.userAnswer
          : [showResult.userAnswer]
    );

    const isCorrect = correctSet.has(index);
    const isSelected = userSet.has(index);

    if (isCorrect && isSelected) return "correct";
    if (!isCorrect && isSelected) return "wrong";
    if (isCorrect && !isSelected) return "missed";
    return "neutral";
  };

  const isSelected = (index: number): boolean => {
    if (selectedAnswer === null) return false;
    if (Array.isArray(selectedAnswer)) return selectedAnswer.includes(index);
    return selectedAnswer === index;
  };

  return (
    <div className="space-y-2">
      {options.map((option, index) => {
        const state = getOptionState(index);
        const selected = isSelected(index);
        const selectionLimitReached =
          !isSingle &&
          !selected &&
          selectionLimit !== undefined &&
          Array.isArray(selectedAnswer) &&
          selectedAnswer.length >= selectionLimit;
        const optionDisabled = disabled || selectionLimitReached;

        return (
          <button
            key={index}
            type="button"
            onClick={() => handleSelect(index)}
            disabled={optionDisabled}
            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all text-sm ${getOptionStyles(state, selected, optionDisabled)}`}
          >
            <span className="flex items-start gap-3">
              {/* ラジオ/チェックボックスのインジケーター */}
              <span className="flex-shrink-0 mt-0.5">
                {isSingle ? (
                  <span
                    className={`inline-block w-4 h-4 rounded-full border-2 ${
                      selected
                        ? "border-blue-600 bg-blue-600"
                        : "border-gray-400"
                    }`}
                  >
                    {selected && (
                      <span className="block w-2 h-2 mx-auto mt-0.5 rounded-full bg-white" />
                    )}
                  </span>
                ) : (
                  <span
                    className={`inline-block w-4 h-4 rounded border-2 ${
                      selected
                        ? "border-blue-600 bg-blue-600"
                        : "border-gray-400"
                    }`}
                  >
                    {selected && (
                      <svg
                        className="w-3 h-3 text-white mx-auto"
                        viewBox="0 0 12 12"
                      >
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                        />
                      </svg>
                    )}
                  </span>
                )}
              </span>

              {/* 選択肢テキスト */}
              <span className="flex-1">{option}</span>

              {/* 正誤アイコン */}
              {state === "correct" && (
                <span className="text-green-600 font-bold">○</span>
              )}
              {state === "wrong" && (
                <span className="text-red-600 font-bold">×</span>
              )}
              {state === "missed" && (
                <span className="text-amber-600 text-xs">正解</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 選択肢の状態に応じたスタイル */
function getOptionStyles(
  state: "correct" | "wrong" | "missed" | "neutral",
  selected: boolean,
  disabled: boolean
): string {
  if (state === "correct") return "border-green-400 bg-green-50";
  if (state === "wrong") return "border-red-400 bg-red-50";
  if (state === "missed") return "border-amber-400 bg-amber-50";

  if (disabled) return "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60";
  if (selected) return "border-blue-500 bg-blue-50";
  return "border-gray-200 bg-white hover:border-gray-300";
}
