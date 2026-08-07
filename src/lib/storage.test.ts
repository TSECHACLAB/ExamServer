// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadStudyProgress, saveExamResult } from "@/lib/storage";
import type { ExamResult } from "@/types/exam";

beforeEach(() => localStorage.clear());

describe("StudyProgressV2", () => {
  it("旧形式の集計を維持し、曖昧な lastAnswer=0 を null へ移行する", () => {
    localStorage.setItem(
      "exam-server-progress",
      JSON.stringify({
        general: {
          lastAttempt: "2026-01-01T00:00:00.000Z",
          attempts: 3,
          bestScore: 80,
          questionHistory: {
            "general-001": { correct: 2, wrong: 1, lastAnswer: 0 },
          },
        },
      }),
    );

    const progress = loadStudyProgress();
    expect(progress.version).toBe(2);
    expect(progress.categories.general).toMatchObject({ attempts: 3, bestScore: 80 });
    expect(progress.categories.general.questionHistory["general-001"]).toEqual({
      correct: 2,
      wrong: 1,
      lastAnswer: null,
    });
    expect(JSON.parse(localStorage.getItem("exam-server-progress") ?? "{}").version).toBe(2);
  });

  it("attemptIdで結果保存を冪等化し、未回答をnullのまま残す", () => {
    const result: ExamResult = {
      attemptId: "attempt-one",
      categoryId: "general",
      mode: "exam",
      finishReason: "manual",
      passingScore: 60,
      results: [{
        questionId: "general-001",
        userAnswer: [],
        correctAnswer: 1,
        score: 0,
        explanation: "解説",
      }],
      totalScore: 0,
      correctCount: 0,
      totalCount: 1,
      timestamp: "2026-08-07T00:00:00.000Z",
    };

    expect(saveExamResult(result)).toBe(true);
    expect(saveExamResult(result)).toBe(false);
    const progress = loadStudyProgress();
    expect(progress.categories.general.attempts).toBe(1);
    expect(progress.categories.general.questionHistory["general-001"].lastAnswer).toBeNull();
  });
});
