"use client";

import { useId } from "react";
import { Checkbox } from "@/vendor/dads-runtime/components/Checkbox";
import { Radio } from "@/vendor/dads-runtime/components/Radio";
import { normalizeSelectedAnswer } from "@/lib/answer-state";
import type { QuestionType } from "@/types/exam";

interface Props {
  options: string[];
  type: QuestionType;
  selectionLimit?: number;
  selectedAnswer: number | number[] | null;
  onChange: (answer: number | number[]) => void;
  legend?: string;
  showResult?: {
    correctAnswer: number | number[];
    userAnswer: number | number[] | null;
  };
  disabled?: boolean;
}

type OptionState = "correct" | "wrong" | "missed" | "neutral";

export default function ChoiceGroup({
  options,
  type,
  selectionLimit,
  selectedAnswer,
  onChange,
  legend = "回答を選択してください",
  showResult,
  disabled = false,
}: Props) {
  const groupName = useId();
  const limitMessageId = `${groupName}-limit`;
  const isSingle = type === "single-choice";
  const normalized = normalizeSelectedAnswer(selectedAnswer);
  const selectedMultiple = Array.isArray(normalized) ? normalized : [];
  const selectionLimitReached =
    !isSingle &&
    selectionLimit !== undefined &&
    selectedMultiple.length >= selectionLimit;

  const updateMultiple = (index: number, checked: boolean) => {
    const next = checked
      ? [...selectedMultiple, index]
      : selectedMultiple.filter((item) => item !== index);
    onChange(next);
  };

  return (
    <fieldset aria-describedby={selectionLimitReached ? limitMessageId : undefined}>
      <legend className="sr-only">{legend}</legend>
      {selectionLimit !== undefined ? (
        <p className="mb-3 text-std-16N-170 text-solid-gray-700">
          {selectionLimit}個選択してください。
        </p>
      ) : null}

      <div className="grid gap-3">
        {options.map((option, index) => {
          const selected = isSelected(normalized, index);
          const state = getOptionState(showResult, index);
          const unavailable =
            disabled || (!isSingle && selectionLimitReached && !selected);
          const control = isSingle ? (
            <Radio
              name={groupName}
              value={index}
              checked={selected}
              disabled={unavailable}
              onChange={() => onChange(index)}
              size="md"
            >
              <OptionLabel option={option} state={state} />
            </Radio>
          ) : (
            <Checkbox
              name={groupName}
              value={index}
              checked={selected}
              disabled={unavailable}
              onChange={(event) => updateMultiple(index, event.target.checked)}
              size="md"
            >
              <OptionLabel option={option} state={state} />
            </Checkbox>
          );

          return (
            <div
              key={index}
              className={`min-h-14 rounded-8 border-2 px-3 py-1 ${optionClassName(
                state,
                selected,
              )}`}
              data-option-state={state}
            >
              {control}
            </div>
          );
        })}
      </div>

      {selectionLimitReached && !disabled ? (
        <p
          id={limitMessageId}
          role="status"
          className="mt-3 border-l-4 border-warning-yellow-1 pl-3 text-std-16N-170 text-solid-gray-800"
        >
          選択できる上限の{selectionLimit}個に達しました。別の項目を選ぶには、選択済みの項目を1つ外してください。
        </p>
      ) : null}
    </fieldset>
  );
}

function OptionLabel({ option, state }: { option: string; state: OptionState }) {
  const status =
    state === "correct"
      ? "○ 正解"
      : state === "wrong"
        ? "× 選択した不正解"
        : state === "missed"
          ? "→ 正解（未選択）"
          : null;
  return (
    <span className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
      <span>{option}</span>
      {status ? <span className="whitespace-nowrap font-bold">{status}</span> : null}
    </span>
  );
}

function getOptionState(
  result: Props["showResult"],
  index: number,
): OptionState {
  if (!result) return "neutral";
  const correct = new Set(
    Array.isArray(result.correctAnswer) ? result.correctAnswer : [result.correctAnswer],
  );
  const user = new Set(
    result.userAnswer === null
      ? []
      : Array.isArray(result.userAnswer)
        ? result.userAnswer
        : [result.userAnswer],
  );
  if (correct.has(index) && user.has(index)) return "correct";
  if (!correct.has(index) && user.has(index)) return "wrong";
  if (correct.has(index)) return "missed";
  return "neutral";
}

function isSelected(answer: number | number[] | null, index: number): boolean {
  if (answer === null) return false;
  return Array.isArray(answer) ? answer.includes(index) : answer === index;
}

function optionClassName(state: OptionState, selected: boolean): string {
  if (state === "correct") return "border-success-1 bg-[var(--surface)]";
  if (state === "wrong") return "border-error-1 bg-[var(--surface)]";
  if (state === "missed") return "border-warning-yellow-1 bg-[var(--surface)]";
  if (selected) return "border-key-900 bg-[var(--primary-soft)]";
  return "border-[var(--border)] bg-[var(--surface)]";
}
