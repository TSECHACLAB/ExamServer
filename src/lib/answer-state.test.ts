import { describe, expect, it } from "vitest";
import type { AnswerState } from "@/types/exam";
import {
  applyAnswerSelection,
  normalizeAnswerState,
  toggleDontKnow,
} from "@/lib/answer-state";

describe("answer-state dontKnow transitions", () => {
  it("marks an unanswered question as dontKnow", () => {
    const state: AnswerState = {
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
      dontKnow: false,
    };

    expect(toggleDontKnow(state)).toEqual({
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
      dontKnow: true,
    });
  });

  it("clears an existing answer when marked as dontKnow", () => {
    const state: AnswerState = {
      questionId: "q1",
      selectedAnswer: [0, 2],
      flagged: true,
      dontKnow: false,
    };

    expect(toggleDontKnow(state)).toEqual({
      questionId: "q1",
      selectedAnswer: null,
      flagged: true,
      dontKnow: true,
    });
  });

  it("toggles dontKnow back to unanswered without touching the flag", () => {
    const state: AnswerState = {
      questionId: "q1",
      selectedAnswer: null,
      flagged: true,
      dontKnow: true,
    };

    expect(toggleDontKnow(state)).toEqual({
      questionId: "q1",
      selectedAnswer: null,
      flagged: true,
      dontKnow: false,
    });
  });

  it("clears dontKnow when an option is selected", () => {
    const state: AnswerState = {
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
      dontKnow: true,
    };

    expect(applyAnswerSelection(state, 2)).toEqual({
      questionId: "q1",
      selectedAnswer: 2,
      flagged: false,
      dontKnow: false,
    });
  });

  it("normalizes old saved answers without dontKnow", () => {
    const saved = {
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
    };

    expect(normalizeAnswerState(saved)).toEqual({
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
      dontKnow: false,
    });
  });

  it("normalizes legacy uncertain saved answers as dontKnow", () => {
    const saved = {
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
      uncertain: true,
    };

    expect(normalizeAnswerState(saved)).toEqual({
      questionId: "q1",
      selectedAnswer: null,
      flagged: false,
      dontKnow: true,
    });
  });
});
