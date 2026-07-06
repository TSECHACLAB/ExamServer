import { describe, expect, it } from "vitest";
import { scoreExam } from "@/lib/scoring";
import type { Question } from "@/types/exam";

const questions: Question[] = [
  {
    id: "q1",
    style: "oneshot",
    type: "single-choice",
    text: "question 1",
    options: ["a", "b"],
    answer: 1,
    explanation: "explanation 1",
  },
  {
    id: "q2",
    style: "oneshot",
    type: "single-choice",
    text: "question 2",
    options: ["a", "b"],
    answer: 0,
    explanation: "explanation 2",
  },
];

describe("scoreExam", () => {
  it("treats dontKnow answers as unanswered while preserving the result marker", () => {
    const answers = new Map([
      ["q1", { answer: null, dontKnow: true }],
      ["q2", { answer: 0, dontKnow: false }],
    ]);

    const result = scoreExam(questions, answers);

    expect(result.totalScore).toBe(50);
    expect(result.correctCount).toBe(1);
    expect(result.results[0]).toMatchObject({
      questionId: "q1",
      userAnswer: null,
      dontKnow: true,
      score: 0,
    });
    expect(result.results[1]).toMatchObject({
      questionId: "q2",
      userAnswer: 0,
      dontKnow: false,
      score: 1,
    });
  });
});
