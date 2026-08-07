import { describe, expect, it } from "vitest";
import {
  getCategories,
  getAllQuestions,
  getQuestionSourceRegistry,
  getQuestionSources,
  getQuestions,
  getScenarios,
} from "@/lib/questions";

const CURRENT_PUBLIC_PAST_SOURCE_IDS = [
  "ipa-sg-2023-r05",
  "ipa-sg-2024-r06",
  "ipa-sg-2025-r07",
  "ipa-sg-2026-r08",
];
const OPTION_LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const LEGACY_ANSWER_KEYS: Record<string, string> = {
  "ipa-sg-2019-autumn-am": "ACADCABAABADCAABBDBDABCCADBDDAAACDAACDBBAADCADCBCC",
  "ipa-sg-2019-spring-am": "CACAABDADBDBBDBABCCDACCCBAABBCDADBDBDACDCDDACDBDCB",
  "ipa-sg-2018-autumn-am": "ADBDCBCABDDDADAACBDDCCCCAAABDBDABDACDACDCCDCDCBCAC",
  "ipa-sg-2018-spring-am": "DCBDCDCABBCABDAADCADDCBCCCADDCAAACDBCDDBABDABDACCA",
  "ipa-sg-2017-autumn-am": "CBACDDCDBCAAABBBACCDABDCBCDCDDCDDDAABCCABCCCDDDCBA",
  "ipa-sg-2017-spring-am": "ACADBBBCBCCCAADACCCCADBBDBAABABCDADADCCBCBCBCADABC",
  "ipa-sg-2016-autumn-am": "DBCCAACBDDDDDBBDBDBAAAABACDCCCDCCCDCDCACACABABCBCB",
  "ipa-sg-2016-spring-am": "CCBBABACADDCBBCCCACCDBCBCDBBADDAADCBBAAADADBADBBBC",
};
const LEGACY_PM_ANSWER_KEYS: Record<string, string> = {
  "ipa-sg-2019-autumn-pm": "オウキアエイイイエカカオウアアエアカエイイエイウエエエオカアコエカ",
  "ipa-sg-2019-spring-pm": "コイオカウウオウキオアイカケオカエケイウキオウキイイイケウキエエカ",
  "ipa-sg-2018-autumn-pm": "アイオウウオウエウウウアエアキアウアイウイキオアイケエウキエエアカオ",
  "ipa-sg-2018-spring-pm": "カカエウケウエケイキウオエウオイアエイウエアウイオオウエオ",
  "ipa-sg-2017-autumn-pm": "カエカウオイオオオエエイオカウアウイウアアケイアアエウイイアエカ",
  "ipa-sg-2017-spring-pm": "オコイオクアウエイイアクイカアエイキカオケアカオイアキエウアカ",
  "ipa-sg-2016-autumn-pm": "オオキエケイオイエウキアエイエアクイイイイアカウアカアウカエイ",
  "ipa-sg-2016-spring-pm": "キクウアエカカエイアエオエオイウエイエアウアウアイイオイエアイイカア",
};

function allReferences(question: ReturnType<typeof getQuestions>[number]) {
  return [question.source, ...(question.sourceOccurrences ?? [])].filter(
    (reference): reference is NonNullable<typeof reference> => Boolean(reference),
  );
}

function officialQuestionNumbers(questionNumber: string): string[] {
  return questionNumber.split("・");
}

describe("SG question provenance", () => {
  it("uses the current official exam durations in category metadata", () => {
    const categories = getCategories();

    expect(categories.find((category) => category.id === "sg")?.timeLimit).toBe(
      120 * 60
    );
    expect(
      categories.find((category) => category.id === "aws-scs")?.timeLimit
    ).toBe(170 * 60);
  });

  it("records the complete official source inventory", () => {
    const registry = getQuestionSourceRegistry("sg");

    expect(registry).not.toBeNull();
    expect(registry?.sources).toHaveLength(25);
    expect(
      registry?.sources.filter((source) => source.exerciseStatus === "complete")
    ).toHaveLength(20);
    expect(
      registry?.sources.filter((source) => source.exerciseStatus === "pending")
    ).toHaveLength(0);
    expect(
      registry?.sources.filter((source) => source.exerciseStatus === "excluded")
    ).toHaveLength(2);
    expect(
      registry?.sources.filter(
        (source) => source.exerciseStatus === "not-available"
      )
    ).toHaveLength(3);
  });

  it("includes every question published for Reiwa 5 through Reiwa 8", () => {
    const questions = getQuestions("sg");
    const sourceSets = getQuestionSources("sg");

    for (const sourceId of CURRENT_PUBLIC_PAST_SOURCE_IDS) {
      const source = sourceSets.find((candidate) => candidate.id === sourceId);
      const references = questions
        .flatMap(allReferences)
        .filter((reference) => reference.sourceId === sourceId)
        .map((reference) => reference.questionNumber)
        .sort((left, right) => Number(left) - Number(right));

      expect(source?.exerciseStatus).toBe("complete");
      expect(references).toEqual(source?.expectedQuestionNumbers);
    }

    expect(
      questions.filter((question) =>
        CURRENT_PUBLIC_PAST_SOURCE_IDS.includes(question.source?.sourceId ?? "")
      )
    ).toHaveLength(60);
  });

  it("keeps every current official answer key fixed", () => {
    const questions = getQuestions("sg");
    const officialAnswerKeys: Record<string, number[]> = {
      "ipa-sg-2023-r05": [1, 1, 2, 3, 3, 0, 1, 1, 2, 0, 1, 1, 3, 4, 2],
      "ipa-sg-2024-r06": [1, 3, 3, 2, 1, 2, 2, 2, 2, 3, 0, 0, 0, 3, 1],
      "ipa-sg-2025-r07": [3, 0, 1, 0, 1, 0, 3, 0, 3, 0, 1, 2, 7, 2, 6],
      "ipa-sg-2026-r08": [2, 0, 0, 3, 2, 0, 3, 1, 1, 1, 0, 2, 3, 7, 3],
    };

    for (const [sourceId, expectedAnswers] of Object.entries(
      officialAnswerKeys
    )) {
      const answers = Array.from({ length: expectedAnswers.length }, (_, index) => {
        const questionNumber = String(index + 1);
        const question = questions.find((candidate) =>
          allReferences(candidate).some(
            (reference) =>
              reference.sourceId === sourceId &&
              reference.questionNumber === questionNumber,
          ),
        );
        const reference = question
          ? allReferences(question).find(
              (candidate) =>
                candidate.sourceId === sourceId &&
                candidate.questionNumber === questionNumber,
            )
          : undefined;
        return reference?.originalAnswer ?? question?.answer;
      });

      expect(answers).toEqual(expectedAnswers);
    }
  });

  it("keeps all eight legacy official answer vectors after deduplication", () => {
    const questions = getQuestions("sg");

    for (const [sourceId, key] of Object.entries(LEGACY_ANSWER_KEYS)) {
      const answers = Array.from({ length: 50 }, (_, index) => {
        const questionNumber = String(index + 1);
        const question = questions.find((candidate) =>
          allReferences(candidate).some(
            (reference) =>
              reference.sourceId === sourceId &&
              reference.questionNumber === questionNumber,
          ),
        );
        const occurrence = question
          ? allReferences(question).find(
              (reference) =>
                reference.sourceId === sourceId &&
                reference.questionNumber === questionNumber,
            )
          : undefined;
        return occurrence?.originalAnswer ?? question?.answer;
      });
      expect(answers).toEqual(
        [...key].map((label) => "ABCD".indexOf(label)),
      );
    }
  });

  it("preserves the historical statute and JIS titles printed in the legacy PDFs", () => {
    const questions = getQuestions("sg");
    const legacyQuestions = questions.filter((question) =>
      allReferences(question).some((reference) => /-20(?:16|17|18|19)-/.test(reference.sourceId)),
    );
    const serializedLegacy = JSON.stringify(legacyQuestions);

    expect(serializedLegacy).not.toContain("情報流通プラットフォーム対処法");
    expect(serializedLegacy).toContain("プロバイダ責任制限法");
    expect(
      questions.find((question) => question.id === "sg-2018-spring-am-q08")?.text,
    ).toContain("JIS Q 27000:2014");
    expect(
      questions.find((question) => question.id === "sg-2017-spring-am-q24")?.text,
    ).toContain("JIS Q 27000:2014");
  });

  it("keeps all 257 legacy afternoon answer slots fixed to the official vectors", () => {
    const questions = getScenarios("sg").flatMap((scenario) => scenario.questions);
    const sourceSets = getQuestionSources("sg");

    expect(getScenarios("sg")).toHaveLength(24);
    expect(questions).toHaveLength(247);
    for (const [sourceId, key] of Object.entries(LEGACY_PM_ANSWER_KEYS)) {
      const source = sourceSets.find((candidate) => candidate.id === sourceId);
      const answers = (source?.expectedQuestionNumbers ?? []).map((questionNumber) => {
        const question = questions.find((candidate) => {
          const reference = candidate.source;
          return (
            reference?.sourceId === sourceId &&
            officialQuestionNumbers(reference.questionNumber).includes(questionNumber)
          );
        });
        if (!question?.source) return "";
        if (Array.isArray(question.answer)) {
          const slotIndex = officialQuestionNumbers(
            question.source.questionNumber,
          ).indexOf(questionNumber);
          return slotIndex >= 0 ? OPTION_LABELS[question.answer[slotIndex]] : "";
        }
        return typeof question.answer === "number" ? OPTION_LABELS[question.answer] : "";
      });

      expect(source?.publishedMajorQuestionCount).toBe(3);
      expect(source?.publishedQuestionCount).toBe(key.length);
      expect(source?.playableQuestionCount).toBe(
        questions.filter((question) => question.source?.sourceId === sourceId).length,
      );
      expect(answers.join("")).toBe(key);
    }
  });

  it("keeps repeated afternoon answer slots as their original multiple-choice questions", () => {
    const questions = getScenarios("sg").flatMap((scenario) => scenario.questions);
    const multipleChoice = questions.filter(
      (question) => question.type === "multiple-choice",
    );

    expect(multipleChoice).toHaveLength(8);
    expect(
      multipleChoice.every(
        (question) =>
          Array.isArray(question.answer) &&
          question.selectionLimit === question.answer.length,
      ),
    ).toBe(true);
    expect(
      multipleChoice.reduce(
        (count, question) => count + (question.answer as number[]).length,
        0,
      ),
    ).toBe(18);
    expect(
      multipleChoice.reduce(
        (count, question) => count + (question.answer as number[]).length - 1,
        0,
      ),
    ).toBe(10);
    expect(
      questions.find((question) => question.id === "sg-2019-spring-pm-q02-u01"),
    ).toMatchObject({
      type: "multiple-choice",
      selectionLimit: 3,
      answer: [0, 1, 5],
      source: {
        questionNumber: "2.01・2.02・2.03",
      },
    });
    expect(
      questions.find((question) => question.id === "sg-2019-spring-pm-q02-u01")?.text,
    ).not.toContain("対象の解答欄");
  });

  it("keeps every image-based afternoon answer group visible", () => {
    const questions = getScenarios("sg").flatMap((scenario) => scenario.questions);
    const imageBased = questions.filter((question) =>
      question.options.every((option) => OPTION_LABELS.includes(option)),
    );

    expect(imageBased.length).toBeGreaterThan(0);
    for (const question of imageBased) {
      expect(question.text, `${question.id} の解答群画像がありません`).toContain("![");
    }

    const sharedPrompt = questions.find(
      (question) => question.id === "sg-2017-autumn-pm-q01-u03",
    );
    expect(sharedPrompt?.text).toContain("c に関する解答群");
    expect(sharedPrompt?.text).toContain("d に関する解答群");
    expect(sharedPrompt?.text.match(/!\[/g)).toHaveLength(2);
  });

  it("resolves every SG question to a structured official source", () => {
    const questions = getAllQuestions("sg");
    const sourceIds = new Set(getQuestionSources("sg").map((source) => source.id));

    expect(getQuestions("sg")).toHaveLength(413);
    expect(questions).toHaveLength(660);
    for (const question of questions) {
      expect(question.source).toBeDefined();
      for (const reference of allReferences(question)) {
        expect(sourceIds.has(reference.sourceId)).toBe(true);
      }
      expect(question.explanation).not.toContain("出典：");
    }
    expect(
      questions.flatMap(allReferences).some((reference) =>
        reference.sourceId.includes("sample"),
      ),
    ).toBe(false);
    expect(
      questions
        .flatMap(allReferences)
        .reduce(
          (count, reference) =>
            count + officialQuestionNumbers(reference.questionNumber).length,
          0,
        ),
    ).toBe(717);
    expect(JSON.stringify(questions)).not.toContain('"answerSlots"');
  });

  it("keeps the corrected official answer group for 2017 spring PM question 1.06", () => {
    const question = getScenarios("sg")
      .flatMap((scenario) => scenario.questions)
      .find((candidate) => candidate.id === "sg-2017-spring-pm-q01-u06");

    expect(question?.options[7]).toBe("(ⅱ)，(ⅲ)，(ⅳ)");
    expect(new Set(question?.options).size).toBe(question?.options.length);
  });

  it("keeps the answer label in each explanation consistent with its answer", () => {
    const questions = getAllQuestions("sg");

    for (const question of questions) {
      const answerIndexes = Array.isArray(question.answer)
        ? question.answer
        : [question.answer as number];
      const statedAnswer = question.explanation.match(
        /正解(?:は|：)\s*[「]?([アイウエオカキクケコ](?:・[アイウエオカキクケコ])*)/
      )?.[1];

      expect(statedAnswer, `${question.id} の解説に正解記号がありません`).toBe(
        answerIndexes.map((answer) => OPTION_LABELS[answer]).join("・")
      );
    }
  });

  it("does not reuse one explanation body for different SG questions", () => {
    const owners = new Map<string, string[]>();

    for (const question of getAllQuestions("sg")) {
      const body = question.explanation
        .replace(
          /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*(?:（[^\n]*）)?\*\*\s*/,
          "",
        )
        .replace(/^正解は「[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*」。\s*/, "")
        .replace(/\s+/g, "")
        .trim();
      owners.set(body, [...(owners.get(body) ?? []), question.id]);
    }

    expect(
      [...owners.values()].filter((ids) => ids.length > 1),
      "異なる問題に同じ解説本文が使われています",
    ).toEqual([]);
  });

  it("keeps the reviewed decision rules in the corrected explanations", () => {
    const questions = new Map(
      getAllQuestions("sg").map((question) => [question.id, question.explanation]),
    );

    expect(questions.get("sg-2019-spring-am-q12")).toContain("3は2進数で011");
    expect(questions.get("sg-2019-spring-am-q12")).toContain("4（100）");
    expect(questions.get("sg-2017-autumn-am-q35")).toContain("部署間で移動");
    expect(questions.get("sg-2017-autumn-am-q35")).not.toContain(
      "PCの移動によりインストール台数が増える",
    );
    expect(questions.get("sg-2017-spring-am-q16")).toContain("辞書攻撃");
    expect(questions.get("sg-2017-spring-am-q16")).toContain("スニッフィング");
    expect(questions.get("sg-2017-spring-am-q16")).toContain("ブルートフォース攻撃");
    expect(questions.get("sg-2019-spring-am-q01")).toContain("内部監査の結果");
    expect(questions.get("sg-2019-spring-am-q01")).toContain("不適合と是正処置");
    expect(questions.get("sg-r06-q09")).toContain("MTBF ÷（MTBF＋MTTR）");
    expect(questions.get("sg-r07-q10")).toContain("S（保守性）");
    expect(questions.get("sg-2016-autumn-pm-q01-u08")).toContain(
      "空欄eは「意図的な公開」",
    );
    expect(questions.get("sg-2016-autumn-pm-q01-u08")).toContain("空欄f");
    expect(questions.get("sg-2016-spring-pm-q02-u01")).toContain("自分で承認");
    expect(questions.get("sg-2016-spring-pm-q02-u01")).toContain("[方針3]");
  });
});
