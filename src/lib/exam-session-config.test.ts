import { describe, expect, it } from "vitest";
import { normalizeExamSessionConfig } from "@/lib/exam-session-config";
import {
  getAllQuestions,
  getCategoryById,
  toPublicQuestion,
} from "@/lib/questions";

describe("受験URLの厳格な正規化", () => {
  it("30分カテゴリの設定をサーバーデータから確定する", () => {
    const category = getCategoryById("general");
    expect(category).toBeDefined();
    const questions = getAllQuestions("general").map(toPublicQuestion);
    const result = normalizeExamSessionConfig(category!, questions, {
      mode: "exam",
      count: "2",
      timer: "1",
      random: "0",
      bucket: "other",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({
      timeLimit: 1800,
      timerEnabled: true,
      passingScore: 60,
      questionCount: 2,
    });
  });

  it("不正値を暗黙補正せず、理由をすべて返す", () => {
    const category = getCategoryById("general")!;
    const questions = getAllQuestions("general").map(toPublicQuestion);
    const result = normalizeExamSessionConfig(category, questions, {
      mode: "practice",
      count: "0",
      timer: "yes",
      random: "2",
      domains: "unknown,unknown",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join("\n")).toMatch(/mode/);
    expect(result.reasons.join("\n")).toMatch(/count/);
    expect(result.reasons.join("\n")).toMatch(/timer/);
    expect(result.reasons.join("\n")).toMatch(/random/);
    expect(result.reasons.join("\n")).toMatch(/重複/);
    expect(result.reasons.join("\n")).toMatch(/存在しない出題範囲/);
  });

  it("一問一答のタイマー指定を拒否する", () => {
    const category = getCategoryById("general")!;
    const result = normalizeExamSessionConfig(
      category,
      getAllQuestions("general").map(toPublicQuestion),
      { mode: "drill", count: "1", timer: "1", random: "0" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("一問一答ではタイマーを使用できません。");
  });

  it("60・65・75%の合格基準を各meta.jsonから得る", () => {
    expect(getCategoryById("general")?.passingScore).toBe(60);
    expect(getCategoryById("java-silver")?.passingScore).toBe(65);
    expect(getCategoryById("aws-scs")?.passingScore).toBe(75);
  });
});
