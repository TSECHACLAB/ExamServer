import type {
  Category,
  NormalizedExamSessionConfig,
  PublicQuestion,
} from "@/types/exam";
import { getQuestionDomains } from "@/lib/question-domains";

type SearchValue = string | string[] | undefined;
export type ExamSessionSearchParams = Record<string, SearchValue>;

export type ExamSessionConfigResult =
  | { ok: true; config: NormalizedExamSessionConfig }
  | { ok: false; reasons: string[]; returnBucket: "certification" | "other" };

export function normalizeExamSessionConfig(
  category: Category,
  questions: PublicQuestion[],
  searchParams: ExamSessionSearchParams,
): ExamSessionConfigResult {
  const reasons: string[] = [];
  const modeValue = singleValue(searchParams.mode, "mode", reasons);
  const countValue = singleValue(searchParams.count, "count", reasons);
  const timerValue = singleValue(searchParams.timer, "timer", reasons);
  const randomValue = singleValue(searchParams.random, "random", reasons);
  const domainsValue = singleValue(searchParams.domains, "domains", reasons, true);
  const bucketValue = singleValue(searchParams.bucket, "bucket", reasons, true);

  const mode = modeValue === "exam" || modeValue === "drill" ? modeValue : null;
  if (!mode) reasons.push("mode は exam または drill を指定してください。");

  const count = countValue && /^\d+$/.test(countValue) ? Number(countValue) : NaN;
  if (!Number.isSafeInteger(count) || count < 1) {
    reasons.push("count は1以上の整数で指定してください。");
  }

  if (timerValue !== "0" && timerValue !== "1") {
    reasons.push("timer は 0 または 1 で指定してください。");
  }
  if (mode === "drill" && timerValue !== "0") {
    reasons.push("一問一答ではタイマーを使用できません。");
  }

  if (randomValue !== "0" && randomValue !== "1") {
    reasons.push("random は 0 または 1 で指定してください。");
  }

  const availableDomains = new Set(
    questions.flatMap((question) => getQuestionDomains(question)),
  );
  const selectedDomains = parseDomains(domainsValue, availableDomains, reasons);
  const filteredQuestions =
    selectedDomains.length === 0
      ? questions
      : questions.filter((question) =>
          getQuestionDomains(question).some((domain) => selectedDomains.includes(domain)),
        );

  if (Number.isSafeInteger(count) && count > filteredQuestions.length) {
    reasons.push(
      `count は選択した範囲の問題数（${filteredQuestions.length}問）以下にしてください。`,
    );
  }

  const defaultBucket = category.group === "certification" ? "certification" : "other";
  const returnBucket =
    bucketValue === undefined || bucketValue === ""
      ? defaultBucket
      : bucketValue === "certification" || bucketValue === "other"
        ? bucketValue
        : defaultBucket;
  if (
    bucketValue !== undefined &&
    bucketValue !== "" &&
    bucketValue !== "certification" &&
    bucketValue !== "other"
  ) {
    reasons.push("bucket は certification または other を指定してください。");
  }

  if (reasons.length > 0 || !mode) return { ok: false, reasons, returnBucket };

  const configBase = {
    categoryId: category.id,
    mode,
    questionCount: count,
    timerEnabled: mode === "exam" && timerValue === "1",
    randomEnabled: randomValue === "1",
    selectedDomains,
    timeLimit: category.timeLimit,
    passingScore: category.passingScore,
    returnBucket,
  } satisfies Omit<NormalizedExamSessionConfig, "fingerprint">;

  return {
    ok: true,
    config: {
      ...configBase,
      fingerprint: createExamSessionFingerprint(configBase),
    },
  };
}

export function createExamSessionFingerprint(
  config: Omit<NormalizedExamSessionConfig, "fingerprint">,
): string {
  return JSON.stringify({
    categoryId: config.categoryId,
    mode: config.mode,
    questionCount: config.questionCount,
    timerEnabled: config.timerEnabled,
    randomEnabled: config.randomEnabled,
    selectedDomains: [...config.selectedDomains].sort(),
    timeLimit: config.timeLimit,
    passingScore: config.passingScore,
  });
}

function singleValue(
  value: SearchValue,
  name: string,
  reasons: string[],
  optional = false,
): string | undefined {
  if (Array.isArray(value)) {
    reasons.push(`${name} は1つだけ指定してください。`);
    return value[0];
  }
  if (!optional && (value === undefined || value === "")) {
    reasons.push(`${name} を指定してください。`);
  }
  return value;
}

function parseDomains(
  raw: string | undefined,
  availableDomains: Set<string>,
  reasons: string[],
): string[] {
  if (raw === undefined || raw === "") return [];
  const entries = raw.split(",").map((domain) => domain.trim());
  if (entries.some((domain) => domain.length === 0)) {
    reasons.push("domains に空の範囲を含めることはできません。");
  }
  const unique = [...new Set(entries.filter(Boolean))];
  if (unique.length !== entries.filter(Boolean).length) {
    reasons.push("domains に同じ範囲を重複して指定できません。");
  }
  const unknown = unique.filter((domain) => !availableDomains.has(domain));
  if (unknown.length > 0) {
    reasons.push(`存在しない出題範囲です: ${unknown.join("、")}`);
  }
  return unique.filter((domain) => availableDomains.has(domain)).sort();
}
