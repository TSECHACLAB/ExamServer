import type { AnswerState } from "@/types/exam";

export type SelectedAnswer = AnswerState["selectedAnswer"];

/** 回答の保存・進捗・採点で共通利用する唯一の正規化処理。 */
export function normalizeSelectedAnswer(
  answer: SelectedAnswer,
): SelectedAnswer {
  if (!Array.isArray(answer)) return answer;
  const unique = [...new Set(answer)].sort((left, right) => left - right);
  return unique.length === 0 ? null : unique;
}

/** 空配列を含め、正規化後に値がない回答は未回答とする。 */
export function isAnswered(answer: SelectedAnswer): boolean {
  return normalizeSelectedAnswer(answer) !== null;
}
