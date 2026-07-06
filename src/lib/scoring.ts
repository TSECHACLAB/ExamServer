/**
 * 採点ロジック
 *
 * 単一選択: 完全一致で1点 or 0点
 * 複数選択: 部分点あり = (正解した数 - 誤選択した数) / 正解の総数（0未満は0）
 */

import type { Question, QuestionResult } from "@/types/exam";

type SubmittedAnswer =
  | number
  | number[]
  | null
  | {
      answer: number | number[] | null;
      dontKnow?: boolean;
    };

/**
 * 1問を採点する
 *
 * @param question - 問題データ（正解付き）
 * @param userAnswer - ユーザーの回答（null は未回答）
 * @returns 0〜1 のスコア
 */
export function scoreQuestion(
  question: Question,
  userAnswer: number | number[] | null
): number {
  if (userAnswer === null) return 0;

  if (question.type === "single-choice") {
    return userAnswer === question.answer ? 1 : 0;
  }

  // 複数選択: 部分点あり
  const correctSet = new Set(question.answer as number[]);
  const selectedSet = new Set(
    Array.isArray(userAnswer) ? userAnswer : [userAnswer]
  );

  let correctHits = 0;
  let wrongHits = 0;

  for (const sel of selectedSet) {
    if (correctSet.has(sel)) {
      correctHits++;
    } else {
      wrongHits++;
    }
  }

  const rawScore = (correctHits - wrongHits) / correctSet.size;
  return Math.max(0, rawScore);
}

/**
 * 複数問をまとめて採点する
 *
 * @returns 各問の結果 + 総合スコア（0〜100）
 */
export function scoreExam(
  questions: Question[],
  answers: Map<string, SubmittedAnswer>
): {
  results: QuestionResult[];
  totalScore: number;
  correctCount: number;
} {
  const results: QuestionResult[] = questions.map((q) => {
    const submitted = normalizeSubmittedAnswer(answers.get(q.id) ?? null);
    const userAnswer = submitted.dontKnow ? null : submitted.answer;
    const score = scoreQuestion(q, userAnswer);

    return {
      questionId: q.id,
      userAnswer,
      dontKnow: submitted.dontKnow,
      correctAnswer: q.answer,
      score,
      explanation: q.explanation,
    };
  });

  const totalPoints = results.reduce((sum, r) => sum + r.score, 0);
  const totalScore =
    results.length > 0 ? Math.round((totalPoints / results.length) * 100) : 0;

  // 完全正解（スコア1.0）のみカウント
  const correctCount = results.filter((r) => r.score === 1).length;

  return { results, totalScore, correctCount };
}

function normalizeSubmittedAnswer(answer: SubmittedAnswer): {
  answer: number | number[] | null;
  dontKnow: boolean;
} {
  if (
    answer !== null &&
    typeof answer === "object" &&
    !Array.isArray(answer)
  ) {
    return {
      answer: answer.answer,
      dontKnow: Boolean(answer.dontKnow),
    };
  }

  return {
    answer,
    dontKnow: false,
  };
}
