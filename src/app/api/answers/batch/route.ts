/**
 * 一括採点 API
 *
 * POST /api/answers/batch
 * 本番モード終了時にまとめて採点する。
 */

import { NextRequest } from "next/server";
import { getAllQuestions, getCategories } from "@/lib/questions";
import { scoreExam } from "@/lib/scoring";
import type { BatchAnswerRequest, BatchAnswerResponse } from "@/types/exam";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as BatchAnswerRequest & {
    categoryId?: string;
  };

  if (!body.answers || !Array.isArray(body.answers)) {
    return Response.json(
      { error: "answers 配列は必須です" },
      { status: 400 }
    );
  }

  // 回答から該当するカテゴリの問題を特定
  const answerMap = new Map<
    string,
    { answer: number | number[] | null; dontKnow: boolean }
  >();
  for (const a of body.answers) {
    answerMap.set(a.questionId, {
      answer: a.answer,
      dontKnow: Boolean(a.dontKnow),
    });
  }

  // categoryId が指定されている場合はそのカテゴリの問題のみ対象
  // 指定がない場合は全カテゴリから回答に含まれる問題を検索
  let targetQuestions;
  if (body.categoryId) {
    targetQuestions = getAllQuestions(body.categoryId);
    // 回答に含まれる問題のみに絞る
    targetQuestions = targetQuestions.filter((q) => answerMap.has(q.id));
  } else {
    const categories = getCategories();
    targetQuestions = categories
      .flatMap((c) => getAllQuestions(c.id))
      .filter((q) => answerMap.has(q.id));
  }

  if (targetQuestions.length === 0) {
    return Response.json(
      { error: "該当する問題が見つかりません" },
      { status: 404 }
    );
  }

  const { results, totalScore, correctCount } = scoreExam(
    targetQuestions,
    answerMap
  );

  const response: BatchAnswerResponse = {
    results,
    totalScore,
    correctCount,
    totalCount: targetQuestions.length,
  };

  return Response.json(response);
}
