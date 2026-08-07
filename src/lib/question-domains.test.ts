import { describe, expect, it } from "vitest";

import {
  countUniqueQuestionsForDomains,
  getQuestionDomains,
} from "@/lib/question-domains";

describe("question domains", () => {
  it("uses all occurrence domains for a deduplicated question", () => {
    expect(
      getQuestionDomains({
        domain: "令和5年度公開問題",
        domains: ["令和5年度公開問題", "平成31年度春期 午前"],
      }),
    ).toEqual(["令和5年度公開問題", "平成31年度春期 午前"]);
  });

  it("falls back to the canonical domain for ordinary questions", () => {
    expect(getQuestionDomains({ domain: "令和8年度公開問題" })).toEqual([
      "令和8年度公開問題",
    ]);
  });

  it("does not double-count a question selected through two periods", () => {
    expect(
      countUniqueQuestionsForDomains(
        {
          "令和5年度公開問題": ["shared", "current-only"],
          "平成31年度春期 午前": ["shared", "legacy-only"],
        },
        ["令和5年度公開問題", "平成31年度春期 午前"],
      ),
    ).toBe(3);
  });
});
