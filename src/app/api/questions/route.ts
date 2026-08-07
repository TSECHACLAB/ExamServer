/**
 * 問題データ取得 API
 *
 * GET /api/questions?categoryId=lpic1
 * 正解・解説を除外した PublicQuestion を返す。
 */

import { NextRequest } from "next/server";
import {
  getQuestions,
  getScenarios,
  getQuestionSourceRegistry,
  toPublicQuestionSourceSet,
  toPublicQuestion,
  toPublicScenario,
} from "@/lib/questions";

export async function GET(request: NextRequest) {
  const categoryId = request.nextUrl.searchParams.get("categoryId");

  if (!categoryId) {
    return Response.json(
      { error: "categoryId は必須です" },
      { status: 400 }
    );
  }

  const questions = getQuestions(categoryId).map(toPublicQuestion);
  const scenarios = getScenarios(categoryId).map(toPublicScenario);
  const sourceRegistry = getQuestionSourceRegistry(categoryId);
  const referencedSourceIds = new Set(
    [...questions, ...scenarios.flatMap((scenario) => scenario.questions)]
      .flatMap((question) => [question.source, ...(question.sourceOccurrences ?? [])])
      .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference))
      .map((reference) => reference.sourceId),
  );
  const sources = (sourceRegistry?.sources ?? [])
    .filter((source) => referencedSourceIds.has(source.id))
    .map(toPublicQuestionSourceSet);

  return Response.json({
    questions,
    scenarios,
    sources,
    sourcePublisher: sourceRegistry?.publisher ?? null,
  });
}
