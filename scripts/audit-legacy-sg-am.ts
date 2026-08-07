import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { JSDOM } from "jsdom";

type ChoiceLabel = "ア" | "イ" | "ウ" | "エ";

interface PeriodDefinition {
  sourceId: string;
  idPrefix: string;
  mirrorPath: string;
  domain: string;
  answerKey: string;
  officialTermReplacements?: Record<string, string>;
}

interface AuditQuestion {
  id: string;
  style: "oneshot";
  type: "single-choice";
  text: string;
  options: string[];
  answer: number;
  domain: string;
  source: {
    sourceId: string;
    questionNumber: string;
    modified: true;
  };
  audit: {
    officialAnswer: ChoiceLabel;
    transcriptionAnswer: ChoiceLabel;
    transcriptionUrl: string;
    contentSha256: string;
    historicalTermRestorations: { currentTerm: string; officialTerm: string }[];
    figureMarkers: string[];
    requiresOfficialFigure: boolean;
  };
}

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-am-audit.json",
);
const MIRROR_BASE = "https://www.sg-siken.com/kakomon";
const LABELS: ChoiceLabel[] = ["ア", "イ", "ウ", "エ"];
const OPTION_IDS = ["select_a", "select_i", "select_u", "select_e"];
const GLOBAL_OFFICIAL_TERM_REPLACEMENTS: Record<string, string> = {
  "情報流通プラットフォーム対処法": "プロバイダ責任制限法",
};

// The answer vectors are transcribed from the IPA answer PDFs registered in
// data/exams/sg/sources.json. The transcription mirror is used only to avoid
// OCR errors in the problem text. A mismatch against these vectors aborts the
// audit, and no mirror URL is ever exposed as a question source.
const PERIODS: PeriodDefinition[] = [
  {
    sourceId: "ipa-sg-2019-autumn-am",
    idPrefix: "sg-2019-autumn-am",
    mirrorPath: "01_aki",
    domain: "令和元年度秋期 午前",
    answerKey: "ACADCABAABADCAABBDBDABCCADBDDAAACDAACDBBAADCADCBCC",
  },
  {
    sourceId: "ipa-sg-2019-spring-am",
    idPrefix: "sg-2019-spring-am",
    mirrorPath: "31_haru",
    domain: "平成31年度春期 午前",
    answerKey: "CACAABDADBDBBDBABCCDACCCBAABBCDADBDBDACDCDDACDBDCB",
  },
  {
    sourceId: "ipa-sg-2018-autumn-am",
    idPrefix: "sg-2018-autumn-am",
    mirrorPath: "30_aki",
    domain: "平成30年度秋期 午前",
    answerKey: "ADBDCBCABDDDADAACBDDCCCCAAABDBDABDACDACDCCDCDCBCAC",
  },
  {
    sourceId: "ipa-sg-2018-spring-am",
    idPrefix: "sg-2018-spring-am",
    mirrorPath: "30_haru",
    domain: "平成30年度春期 午前",
    answerKey: "DCBDCDCABBCABDAADCADDCBCCCADDCAAACDBCDDBABDABDACCA",
    officialTermReplacements: {
      "JIS Q 27000:2019": "JIS Q 27000:2014",
    },
  },
  {
    sourceId: "ipa-sg-2017-autumn-am",
    idPrefix: "sg-2017-autumn-am",
    mirrorPath: "29_aki",
    domain: "平成29年度秋期 午前",
    answerKey: "CBACDDCDBCAAABBBACCDABDCBCDCDDCDDDAABCCABCCCDDDCBA",
  },
  {
    sourceId: "ipa-sg-2017-spring-am",
    idPrefix: "sg-2017-spring-am",
    mirrorPath: "29_haru",
    domain: "平成29年度春期 午前",
    answerKey: "ACADBBBCBCCCAADACCCCADBBDBAABABCDADADCCBCBCBCADABC",
    officialTermReplacements: {
      "JIS Q 27000:2019": "JIS Q 27000:2014",
    },
  },
  {
    sourceId: "ipa-sg-2016-autumn-am",
    idPrefix: "sg-2016-autumn-am",
    mirrorPath: "28_aki",
    domain: "平成28年度秋期 午前",
    answerKey: "DBCCAACBDDDDDBBDBDBAAAABACDCCCDCCCDCDCACACABABCBCB",
  },
  {
    sourceId: "ipa-sg-2016-spring-am",
    idPrefix: "sg-2016-spring-am",
    mirrorPath: "28_haru",
    domain: "平成28年度春期 午前",
    answerKey: "CCBBABACADDCBBCCCACCDBCBCDBBADDAADCBBAAADADBADBBBC",
  },
];

function compactLines(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .replace(/([一-龯々])\([ぁ-ん]+\)(?=[一-龯々])/g, "$1")
    .replaceAll("公開健", "公開鍵")
    .replaceAll("セキュリテイ", "セキュリティ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textOnly(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (element.tagName.toLowerCase() === "rt") return "";
  return Array.from(element.childNodes).map(textOnly).join("");
}

function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr"))
    .map((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) =>
        compactLines(Array.from(cell.childNodes).map(nodeToMarkdown).join(" ")).replaceAll("|", "\\|"),
      ),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
  const header = normalized[0];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "rt"].includes(tag)) return "";
  if (tag === "br") return "\n";
  if (tag === "img") {
    const src = element.getAttribute("src")?.split("/").at(-1) ?? "unknown";
    return `[[OFFICIAL_FIGURE:${src}]]`;
  }
  if (tag === "table") return `\n${tableToMarkdown(element)}\n`;
  if (tag === "sub") return `_{${compactLines(textOnly(element))}}`;
  if (tag === "sup") return `^{${compactLines(textOnly(element))}}`;
  const content = Array.from(element.childNodes).map(nodeToMarkdown).join("");
  if (tag === "li") return `\n- ${content}`;
  if (["div", "p", "section", "ul", "ol", "dl", "dt", "dd"].includes(tag)) {
    return `\n${content}\n`;
  }
  return content;
}

function elementToMarkdown(element: Element): string {
  return compactLines(Array.from(element.childNodes).map(nodeToMarkdown).join(""));
}

function restoreOfficialHistoricalTerms(
  value: string,
  period: PeriodDefinition,
): string {
  // The transcription site follows the current statute title, but the IPA
  // PDFs published in 2016-2019 use the title below. Preserve the wording of
  // the actual examination rather than retroactively modernising it.
  let restored = value;
  for (const [currentTerm, officialTerm] of Object.entries(
    {
      ...GLOBAL_OFFICIAL_TERM_REPLACEMENTS,
      ...(period.officialTermReplacements ?? {}),
    },
  )) {
    restored = restored.replaceAll(currentTerm, officialTerm);
  }
  return restored;
}

function normalizedContent(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】]/g, "");
}

function contentKey(question: Pick<AuditQuestion, "text" | "options">): string {
  const choices = question.options.map(normalizedContent).sort();
  return `${normalizedContent(question.text)}\u0000${choices.join("\u0001")}`;
}

function trigramSet(value: string): Set<string> {
  const normalized = normalizedContent(value);
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 2; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

async function mapLimited<T, U>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<U>,
): Promise<U[]> {
  const output = new Array<U>(values.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return output;
}

function validatePeriodDefinitions(): void {
  for (const period of PERIODS) {
    if (!/^[ABCD]{50}$/.test(period.answerKey)) {
      throw new Error(`${period.sourceId}: official answer key must contain exactly 50 A-D entries (actual ${period.answerKey.length})`);
    }
  }
}

async function fetchQuestion(period: PeriodDefinition, number: number): Promise<AuditQuestion> {
  const url = `${MIRROR_BASE}/${period.mirrorPath}/q${number}.html`;
  const response = await fetch(url, {
    headers: { "user-agent": "ExamServer official-PDF transcription audit/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const html = await response.text();
  const document = new JSDOM(html).window.document;
  const problem = document.querySelector("#mondai");
  if (!problem) throw new Error(`${url}: #mondai was not found`);
  const rawText = elementToMarkdown(problem);
  const text = restoreOfficialHistoricalTerms(rawText, period);
  const optionElements = OPTION_IDS.map((id) => document.querySelector(`#${id}`));
  let options: string[];
  let rawOptions: string[] = [];
  if (optionElements.every((option) => option !== null)) {
    rawOptions = optionElements.map((option) => elementToMarkdown(option as Element));
    options = rawOptions.map((option) =>
      restoreOfficialHistoricalTerms(option, period),
    );
  } else {
    const answerArea = document.querySelector("div.ansbg:not(#kaisetsu)");
    const imageSources = answerArea
      ? Array.from(answerArea.querySelectorAll("img"))
          .map((image) => image.getAttribute("src")?.split("/").at(-1))
          .filter((source): source is string => Boolean(source))
      : [];
    if (imageSources.length === 0) {
      throw new Error(`${url}: choice text and choice figure were both missing`);
    }
    const marker = imageSources.map((source) => `[[OFFICIAL_FIGURE:${source}]]`).join("\n");
    options = LABELS.map((label) => `${marker} 選択肢${label}`);
  }
  const answerText = document.querySelector("#answerChar")?.textContent?.trim();
  if (!LABELS.includes(answerText as ChoiceLabel)) {
    throw new Error(`${url}: invalid transcription answer ${JSON.stringify(answerText)}`);
  }
  const transcriptionAnswer = answerText as ChoiceLabel;
  const officialAnswer = LABELS["ABCD".indexOf(period.answerKey[number - 1])];
  if (transcriptionAnswer !== officialAnswer) {
    throw new Error(
      `${url}: answer mismatch (official ${officialAnswer}, transcription ${transcriptionAnswer})`,
    );
  }
  const markers = [...`${text}\n${options.join("\n")}`.matchAll(/\[\[OFFICIAL_FIGURE:([^\]]+)\]\]/g)].map(
    (match) => match[1],
  );
  const contentSha256 = createHash("sha256")
    .update(contentKey({ text, options }))
    .digest("hex");
  const rawContent = `${rawText}\n${rawOptions.join("\n")}`;
  const historicalTermRestorations = Object.entries({
    ...GLOBAL_OFFICIAL_TERM_REPLACEMENTS,
    ...(period.officialTermReplacements ?? {}),
  })
    .filter(([currentTerm]) => rawContent.includes(currentTerm))
    .map(([currentTerm, officialTerm]) => ({ currentTerm, officialTerm }));
  return {
    id: `${period.idPrefix}-q${String(number).padStart(2, "0")}`,
    style: "oneshot",
    type: "single-choice",
    text,
    options,
    answer: LABELS.indexOf(officialAnswer),
    domain: period.domain,
    source: {
      sourceId: period.sourceId,
      questionNumber: String(number),
      modified: true,
    },
    audit: {
      officialAnswer,
      transcriptionAnswer,
      transcriptionUrl: url,
      contentSha256,
      historicalTermRestorations,
      figureMarkers: markers,
      requiresOfficialFigure: markers.length > 0,
    },
  };
}

async function main(): Promise<void> {
  validatePeriodDefinitions();
  const requests = PERIODS.flatMap((period) =>
    Array.from({ length: 50 }, (_, index) => ({ period, number: index + 1 })),
  );
  const questions = await mapLimited(requests, 8, ({ period, number }) =>
    fetchQuestion(period, number),
  );

  const exactGroups = new Map<string, string[]>();
  for (const question of questions) {
    const key = contentKey(question);
    exactGroups.set(key, [...(exactGroups.get(key) ?? []), question.id]);
  }
  const exactDuplicates = [...exactGroups.values()].filter((ids) => ids.length > 1);

  const grams = questions.map((question) =>
    trigramSet(`${question.text}\n${question.options.join("\n")}`),
  );
  const nearDuplicates: { left: string; right: string; similarity: number }[] = [];
  for (let left = 0; left < questions.length; left += 1) {
    for (let right = left + 1; right < questions.length; right += 1) {
      const similarity = jaccard(grams[left], grams[right]);
      if (similarity >= 0.82 && contentKey(questions[left]) !== contentKey(questions[right])) {
        nearDuplicates.push({
          left: questions[left].id,
          right: questions[right].id,
          similarity: Number(similarity.toFixed(4)),
        });
      }
    }
  }
  nearDuplicates.sort((left, right) => right.similarity - left.similarity);

  const report = {
    generatedAt: new Date().toISOString(),
    policy: {
      canonicalSources: "IPA question and answer PDFs registered in data/exams/sg/sources.json",
      transcriptionAid: MIRROR_BASE,
      publicationRule: "Do not publish until official PDF figures and explanations are reviewed.",
    },
    summary: {
      questionCount: questions.length,
      answerMismatchCount: 0,
      requiresOfficialFigureCount: questions.filter(
        (question) => question.audit.requiresOfficialFigure,
      ).length,
      exactDuplicateGroupCount: exactDuplicates.length,
      nearDuplicatePairCount: nearDuplicates.length,
      historicalTermRestorationCount: questions.reduce(
        (count, question) => count + question.audit.historicalTermRestorations.length,
        0,
      ),
    },
    exactDuplicates,
    nearDuplicates,
    questions,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
