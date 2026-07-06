import type { AnswerState } from "@/types/exam";

type SavedAnswerState = Omit<AnswerState, "dontKnow"> & {
  dontKnow?: boolean;
  uncertain?: boolean;
};

export function createEmptyAnswerState(questionId: string): AnswerState {
  return {
    questionId,
    selectedAnswer: null,
    flagged: false,
    dontKnow: false,
  };
}

export function applyAnswerSelection(
  state: AnswerState,
  selectedAnswer: number | number[]
): AnswerState {
  return {
    ...state,
    selectedAnswer,
    dontKnow: false,
  };
}

export function toggleDontKnow(state: AnswerState): AnswerState {
  return {
    ...state,
    selectedAnswer: null,
    dontKnow: !state.dontKnow,
  };
}

export function markDontKnow(state: AnswerState): AnswerState {
  return {
    ...state,
    selectedAnswer: null,
    dontKnow: true,
  };
}

export function normalizeAnswerState(answer: SavedAnswerState): AnswerState {
  return {
    questionId: answer.questionId,
    selectedAnswer: answer.selectedAnswer,
    flagged: Boolean(answer.flagged),
    dontKnow: Boolean(answer.dontKnow ?? answer.uncertain),
  };
}
