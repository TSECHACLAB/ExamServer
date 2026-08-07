import { describe, expect, it } from "vitest";

import { scoreQuestion } from "@/lib/scoring";
import type { Question } from "@/types/exam";

const officialMultiAnswerQuestion: Question = {
  id: "official-multi-answer",
  style: "scenario",
  type: "multiple-choice",
  selectionLimit: 3,
  text: "三つ選べ。",
  options: ["ア", "イ", "ウ", "エ", "オ", "カ"],
  answer: [0, 1, 5],
  explanation: "正解はア、イ、カ。",
};

describe("scoreQuestion", () => {
  it("選択数指定問題を公式解答欄ごとの正答数で採点する", () => {
    expect(scoreQuestion(officialMultiAnswerQuestion, [0, 1])).toBeCloseTo(2 / 3);
    expect(scoreQuestion(officialMultiAnswerQuestion, [0, 1, 2])).toBeCloseTo(2 / 3);
    expect(scoreQuestion(officialMultiAnswerQuestion, [0, 1, 5])).toBe(1);
  });

  it("指定数を超えた回答では総当たりによる得点を認めない", () => {
    expect(scoreQuestion(officialMultiAnswerQuestion, [0, 1, 2, 5])).toBe(0);
  });
});
