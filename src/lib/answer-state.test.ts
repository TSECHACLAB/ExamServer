import { describe, expect, it } from "vitest";
import { isAnswered, normalizeSelectedAnswer } from "@/lib/answer-state";

describe("回答状態の共通判定", () => {
  it("空配列を未回答に正規化する", () => {
    expect(normalizeSelectedAnswer([])).toBeNull();
    expect(isAnswered([])).toBe(false);
  });

  it("複数回答を重複除去して安定順にする", () => {
    expect(normalizeSelectedAnswer([3, 1, 3])).toEqual([1, 3]);
    expect(isAnswered([3, 1])).toBe(true);
  });
});
