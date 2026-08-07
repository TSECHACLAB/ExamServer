import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as getQuestions } from "@/app/api/questions/route";
import { POST as postAnswer } from "@/app/api/answers/route";
import { POST as postBatchAnswers } from "@/app/api/answers/batch/route";
import { getAllQuestions, getScenarios } from "@/lib/questions";

describe("演習API結合", () => {
  it("実問題データを正解と解説を伏せて配信する", async () => {
    const response = await getQuestions(
      getRequest("/api/questions?categoryId=general")
    );
    const body = (await response.json()) as {
      questions: Record<string, unknown>[];
      scenarios: Record<string, unknown>[];
    };

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(5);
    expect(body.scenarios).toEqual([]);
    expect(body.questions[0]).toMatchObject({
      id: "general-001",
      type: "single-choice",
    });
    expect(body.questions[0]).not.toHaveProperty("answer");
    expect(body.questions[0]).not.toHaveProperty("explanation");
  });

  it("シナリオ問題も構造を保ったまま正解を伏せて配信する", async () => {
    const response = await getQuestions(
      getRequest("/api/questions?categoryId=sc")
    );
    const body = (await response.json()) as {
      questions: Record<string, unknown>[];
      scenarios: {
        id: string;
        questions: Record<string, unknown>[];
      }[];
    };

    expect(response.status).toBe(200);
    expect(body.questions).toEqual([]);
    expect(body.scenarios).toHaveLength(2);
    expect(body.scenarios[0].questions.length).toBeGreaterThan(0);
    expect(body.scenarios[0].questions[0]).not.toHaveProperty("answer");
    expect(body.scenarios[0].questions[0]).not.toHaveProperty("explanation");
  });

  it("公式問題の出典を正解とは分離して配信する", async () => {
    const response = await getQuestions(
      getRequest("/api/questions?categoryId=sg")
    );
    const body = (await response.json()) as {
      questions: {
        id: string;
        source?: { sourceId: string; questionNumber: string };
        answer?: unknown;
      }[];
      scenarios: {
        id: string;
        questions: Record<string, unknown>[];
      }[];
      sources: { id: string; kind: string }[];
      sourcePublisher: { name: string } | null;
    };

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(413);
    expect(body.scenarios).toHaveLength(24);
    expect(body.questions[0]).toMatchObject({
      id: "sg-r08-q01",
      source: {
        sourceId: "ipa-sg-2026-r08",
        questionNumber: "1",
      },
    });
    expect(body.questions[0]).not.toHaveProperty("answer");
    expect(body.scenarios[0].questions[0]).not.toHaveProperty("answer");
    expect(body.scenarios[0].questions[0]).not.toHaveProperty("explanation");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('"originalAnswer"');
    expect(serialized).not.toContain('"answerPdf"');
    expect(serialized).not.toContain('"commentaryPdf"');
    expect(serialized).not.toContain('"sha256"');
    expect(serialized).not.toContain('"expectedQuestionNumbers"');
    expect(serialized).not.toContain('"answerSlots"');
    expect(body.sources).toHaveLength(20);
    expect(body.sources.every((source) => source.kind === "official-past")).toBe(true);
    expect(body.sources).toContainEqual(
      expect.objectContaining({
        id: "ipa-sg-2026-r08",
        kind: "official-past",
      })
    );
    expect(body.sourcePublisher?.name).toContain("情報処理推進機構");
  });

  it("一問一答で実データの正答と未回答を採点する", async () => {
    const [question] = getAllQuestions("general");

    const correctResponse = await postAnswer(
      postRequest("/api/answers", {
        categoryId: "general",
        questionId: question.id,
        answer: question.answer,
      })
    );
    const correctBody = await correctResponse.json();

    expect(correctResponse.status).toBe(200);
    expect(correctBody).toMatchObject({
      questionId: question.id,
      correct: true,
      score: 1,
      answer: question.answer,
      explanation: question.explanation,
    });

    const unknownResponse = await postAnswer(
      postRequest("/api/answers", {
        categoryId: "general",
        questionId: question.id,
        answer: null,
      })
    );
    const unknownBody = await unknownResponse.json();

    expect(unknownResponse.status).toBe(200);
    expect(unknownBody).toMatchObject({
      questionId: question.id,
      correct: false,
      score: 0,
    });
  });

  it("複数選択の部分正解を実データの正解集合から計算する", async () => {
    const question = getAllQuestions("general")[2];
    expect(question.type).toBe("multiple-choice");

    const response = await postAnswer(
      postRequest("/api/answers", {
        categoryId: "general",
        questionId: question.id,
        answer: [0, 1],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      questionId: question.id,
      correct: false,
      answer: [0, 1, 3],
    });
    expect(body.score).toBeCloseTo(2 / 3);
  });

  it("公式午後の選択数指定問題を解答欄単位で採点する", async () => {
    const question = getScenarios("sg")
      .flatMap((scenario) => scenario.questions)
      .find((candidate) => candidate.id === "sg-2019-spring-pm-q02-u01");
    expect(question).toMatchObject({
      type: "multiple-choice",
      selectionLimit: 3,
      answer: [0, 1, 5],
    });

    const partialResponse = await postAnswer(
      postRequest("/api/answers", {
        categoryId: "sg",
        questionId: question?.id,
        answer: [0, 1],
      }),
    );
    expect(partialResponse.status).toBe(200);
    await expect(partialResponse.json()).resolves.toMatchObject({
      correct: false,
      score: 2 / 3,
    });

    const overSelectedResponse = await postAnswer(
      postRequest("/api/answers", {
        categoryId: "sg",
        questionId: question?.id,
        answer: [0, 1, 2, 5],
      }),
    );
    expect(overSelectedResponse.status).toBe(200);
    await expect(overSelectedResponse.json()).resolves.toMatchObject({
      correct: false,
      score: 0,
    });
  });

  it("別カテゴリの問題IDを指定した採点を拒否する", async () => {
    const [question] = getAllQuestions("general");
    const response = await postAnswer(
      postRequest("/api/answers", {
        categoryId: "sg",
        questionId: question.id,
        answer: question.answer,
      })
    );

    expect(response.status).toBe(404);
  });

  it("表示対象の実問題だけを一括採点する", async () => {
    const [first, second] = getAllQuestions("general");
    const response = await postBatchAnswers(
      postRequest("/api/answers/batch", {
        categoryId: "general",
        answers: [
          { questionId: first.id, answer: first.answer },
          { questionId: second.id, answer: null },
        ],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      totalScore: 50,
      correctCount: 1,
      totalCount: 2,
    });
    expect(body.results.map((result: { questionId: string }) => result.questionId)).toEqual([
      first.id,
      second.id,
    ]);
  });
});

function getRequest(path: string): NextRequest {
  return new NextRequest(`https://example.test${path}`);
}

function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
