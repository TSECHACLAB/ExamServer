import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { JSDOM } from "jsdom";

import {
  compactJapaneseText,
  elementToMarkdown,
  type MarkdownImage,
} from "./lib/dom-to-markdown";

type ChoiceLabel = "ア" | "イ" | "ウ" | "エ" | "オ" | "カ" | "キ" | "ク" | "ケ" | "コ";

interface PeriodDefinition {
  sourceId: string;
  idPrefix: string;
  mirrorPath: string;
  domain: string;
}

interface OfficialAnswerRecord {
  sourceId: string;
  answerPdfSha256: string;
  answerCount: number;
  labels: ChoiceLabel[];
}

interface AuditQuestion {
  id: string;
  style: "scenario";
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
    answerSlot: string;
    transcriptionUrl: string;
    contentSha256: string;
    figureMarkers: MarkdownImage[];
    requiresOfficialFigure: boolean;
    factCheckAvailable: boolean;
    factCheckNotesSha256: string | null;
  };
}

interface AuditScenario {
  id: string;
  title: string;
  scenario: string;
  domain: string;
  sourceId: string;
  majorQuestionNumber: string;
  questions: AuditQuestion[];
  audit: {
    transcriptionUrl: string;
    figureMarkers: MarkdownImage[];
    contentSha256: string;
  };
}

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-audit.json",
);
const ANSWER_KEYS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-answer-keys.json",
);
const MIRROR_BASE = "https://www.sg-siken.com/kakomon";
const LABELS: ChoiceLabel[] = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const OFFICIAL_OPTION_CORRECTIONS: Record<
  string,
  { index: number; from: string; to: string; reason: string }
> = {
  "sg-2017-spring-pm-q01-u06": {
    index: 7,
    from: "(ⅲ)，(ⅳ)",
    to: "(ⅱ)，(ⅲ)，(ⅳ)",
    reason:
      "補助転記の選択肢クで(ⅱ)が欠落している。IPA公式問題PDF 11ページの解答群は(ⅱ),(ⅲ),(ⅳ)。",
  },
};

const PERIODS: PeriodDefinition[] = [
  { sourceId: "ipa-sg-2019-autumn-pm", idPrefix: "sg-2019-autumn-pm", mirrorPath: "01_aki", domain: "令和元年度秋期 午後" },
  { sourceId: "ipa-sg-2019-spring-pm", idPrefix: "sg-2019-spring-pm", mirrorPath: "31_haru", domain: "平成31年度春期 午後" },
  { sourceId: "ipa-sg-2018-autumn-pm", idPrefix: "sg-2018-autumn-pm", mirrorPath: "30_aki", domain: "平成30年度秋期 午後" },
  { sourceId: "ipa-sg-2018-spring-pm", idPrefix: "sg-2018-spring-pm", mirrorPath: "30_haru", domain: "平成30年度春期 午後" },
  { sourceId: "ipa-sg-2017-autumn-pm", idPrefix: "sg-2017-autumn-pm", mirrorPath: "29_aki", domain: "平成29年度秋期 午後" },
  { sourceId: "ipa-sg-2017-spring-pm", idPrefix: "sg-2017-spring-pm", mirrorPath: "29_haru", domain: "平成29年度春期 午後" },
  { sourceId: "ipa-sg-2016-autumn-pm", idPrefix: "sg-2016-autumn-pm", mirrorPath: "28_aki", domain: "平成28年度秋期 午後" },
  { sourceId: "ipa-sg-2016-spring-pm", idPrefix: "sg-2016-spring-pm", mirrorPath: "28_haru", domain: "平成28年度春期 午後" },
];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nextMatchingSibling(
  start: Element,
  predicate: (element: Element) => boolean,
): Element | null {
  let current = start.nextElementSibling;
  while (current) {
    if (predicate(current)) return current;
    if (current.matches("div.inputAnswerBox")) return null;
    current = current.nextElementSibling;
  }
  return null;
}

function getAnswerSlot(select: HTMLSelectElement, fallback: number): string {
  const raw = select.getAttribute("name") ?? select.id;
  const matched = raw.match(/sel_(.+)$/);
  return matched?.[1] ?? String(fallback);
}

function parseOptions(select: HTMLSelectElement, url: string): {
  labels: ChoiceLabel[];
  options: string[];
} {
  const rawOptions = Array.from(select.options)
    .map((option) => compactJapaneseText(option.textContent ?? ""))
    .filter((option) => option !== "" && option !== "-");
  const labels: ChoiceLabel[] = [];
  const options = rawOptions.map((option) => {
    const match = option.match(/^([アイウエオカキクケコ])[\s　]*([\s\S]*)$/);
    if (!match) throw new Error(`${url}: option has no choice label: ${option}`);
    const label = match[1] as ChoiceLabel;
    labels.push(label);
    return match[2].trim() || `選択肢${label}`;
  });
  if (options.length < 2 || options.length > 10) {
    throw new Error(`${url}: invalid option count ${options.length}`);
  }
  if (new Set(labels).size !== labels.length) {
    throw new Error(`${url}: duplicate option labels`);
  }
  return { labels, options };
}

function extractFactCheckNotes(box: Element): string | null {
  const explanation = nextMatchingSibling(
    box,
    (element) => element.matches("div.kaisetsu"),
  );
  if (!explanation) return null;
  const text = compactJapaneseText(explanation.textContent ?? "");
  if (!text || text.includes("解説はまだありません")) return null;
  return text;
}

function parsePage(
  period: PeriodDefinition,
  major: number,
  html: string,
  url: string,
  officialLabels: ChoiceLabel[],
  answerCursor: { value: number },
): AuditScenario {
  const document = new JSDOM(html, { url }).window.document;
  const main = document.querySelector(".main.kako");
  if (!main) throw new Error(`${url}: .main.kako was not found`);
  const heading = main.querySelector("h3.qno");
  if (!heading) throw new Error(`${url}: h3.qno was not found`);
  const directChildren = Array.from(main.children);
  const headingIndex = directChildren.indexOf(heading);
  const passage = directChildren
    .slice(headingIndex + 1)
    .find((element) => element.matches("div.mondai"));
  if (!passage) throw new Error(`${url}: scenario passage was not found`);

  const scenarioId = `${period.idPrefix}-q${String(major).padStart(2, "0")}`;
  const scenarioFigures: MarkdownImage[] = [];
  const scenario = elementToMarkdown(passage, {
    imagePrefix: `${scenarioId}-scenario`,
    baseUrl: url,
    images: scenarioFigures,
  });
  const title = compactJapaneseText(heading.textContent ?? "")
    .replace(new RegExp(`^問${major}[\s　]*`), "")
    .trim();
  if (!title || scenario.length < 100) {
    throw new Error(`${url}: title or scenario is implausibly short`);
  }

  const questions: AuditQuestion[] = [];
  for (const box of Array.from(main.querySelectorAll("div.inputAnswerBox"))) {
    const boxIndex = directChildren.indexOf(box);
    const prompt = directChildren
      .slice(0, boxIndex)
      .reverse()
      .find((element) => element.matches("div.mondai"));
    const promptIndex = prompt ? directChildren.indexOf(prompt) : -1;
    const choiceAreas = directChildren
      .slice(promptIndex + 1, boxIndex)
      .filter((element) => element.matches("div.select.ansbg"));
    if (choiceAreas.length === 0 || !prompt) {
      throw new Error(`${url}: prompt or answer group is missing`);
    }
    const answerBlock = nextMatchingSibling(
      box,
      (element) => element.querySelector("[id^='ans_']") !== null,
    );
    if (!answerBlock) throw new Error(`${url}: answer block is missing`);
    const answerBySlot = new Map(
      Array.from(answerBlock.querySelectorAll("[id^='ans_']")).map((element) => [
        element.id.replace(/^ans_/, ""),
        compactJapaneseText(element.textContent ?? "") as ChoiceLabel,
      ]),
    );
    const selects = Array.from(box.querySelectorAll("select")) as HTMLSelectElement[];
    if (selects.length === 0) throw new Error(`${url}: select is missing`);

    const promptFigures: MarkdownImage[] = [];
    const promptText = elementToMarkdown(prompt, {
      imagePrefix: `${scenarioId}-u${String(questions.length + 1).padStart(2, "0")}-prompt`,
      baseUrl: url,
      images: promptFigures,
    });
    const choiceFigures: MarkdownImage[] = [];
    const choiceMarkdown = choiceAreas
      .map((choiceArea) =>
        elementToMarkdown(choiceArea, {
          imagePrefix: `${scenarioId}-u${String(questions.length + 1).padStart(2, "0")}-choices`,
          baseUrl: url,
          images: choiceFigures,
        }),
      )
      .filter(Boolean)
      .join("\n\n");
    const factCheckNotes = extractFactCheckNotes(box);

    for (const [selectIndex, select] of selects.entries()) {
      const unit = questions.length + 1;
      const answerSlot = getAnswerSlot(select, unit);
      const transcriptionAnswer = answerBySlot.get(answerSlot);
      if (!transcriptionAnswer || !LABELS.includes(transcriptionAnswer)) {
        throw new Error(`${url}: transcription answer for ${answerSlot} is missing`);
      }
      const officialAnswer = officialLabels[answerCursor.value];
      if (!officialAnswer) {
        throw new Error(`${url}: official answer vector ended at unit ${answerCursor.value + 1}`);
      }
      answerCursor.value += 1;
      if (transcriptionAnswer !== officialAnswer) {
        throw new Error(
          `${url}: answer mismatch for ${answerSlot}: official=${officialAnswer}, transcription=${transcriptionAnswer}`,
        );
      }
      const questionId = `${scenarioId}-u${String(unit).padStart(2, "0")}`;
      const parsed = parseOptions(select, url);
      const optionCorrection = OFFICIAL_OPTION_CORRECTIONS[questionId];
      if (optionCorrection) {
        if (parsed.options[optionCorrection.index] !== optionCorrection.from) {
          throw new Error(
            `${questionId}: official option correction target changed; expected ${optionCorrection.from}`,
          );
        }
        parsed.options[optionCorrection.index] = optionCorrection.to;
      }
      if (new Set(parsed.options).size !== parsed.options.length) {
        throw new Error(`${questionId}: duplicate option text remains after official-PDF review`);
      }
      const answer = parsed.labels.indexOf(officialAnswer);
      if (answer < 0) {
        throw new Error(`${url}: official answer ${officialAnswer} is absent from ${answerSlot}`);
      }
      const suffix = selects.length > 1 ? `\n\n対象の解答欄：${answerSlot.replace(/^\d+/, "") || selectIndex + 1}` : "";
      const needsRenderedChoiceGroup = parsed.options.every((option) =>
        /^選択肢[アイウエオカキクケコ]$/.test(option),
      );
      const text = `${promptText}${
        needsRenderedChoiceGroup && choiceMarkdown ? `\n\n${choiceMarkdown}` : ""
      }${suffix}`;
      const figureMarkers = [...promptFigures, ...choiceFigures];
      const questionNumber = `${major}.${String(unit).padStart(2, "0")}`;
      questions.push({
        id: questionId,
        style: "scenario",
        type: "single-choice",
        text,
        options: parsed.options,
        answer,
        domain: period.domain,
        source: {
          sourceId: period.sourceId,
          questionNumber,
          modified: true,
        },
        audit: {
          officialAnswer,
          transcriptionAnswer,
          answerSlot,
          transcriptionUrl: url,
          contentSha256: sha256(`${text}\n${parsed.options.join("\n")}`),
          figureMarkers,
          requiresOfficialFigure: figureMarkers.length > 0,
          factCheckAvailable: factCheckNotes !== null,
          factCheckNotesSha256: factCheckNotes ? sha256(factCheckNotes) : null,
        },
      });
    }
  }
  if (questions.length === 0) throw new Error(`${url}: no answer units were parsed`);
  return {
    id: scenarioId,
    title,
    scenario,
    domain: period.domain,
    sourceId: period.sourceId,
    majorQuestionNumber: String(major),
    questions,
    audit: {
      transcriptionUrl: url,
      figureMarkers: scenarioFigures,
      contentSha256: sha256(`${title}\n${scenario}`),
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "ExamServer official-PDF transcription audit/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function main(): Promise<void> {
  if (!fs.existsSync(ANSWER_KEYS)) {
    throw new Error("Run scripts/extract-legacy-sg-pm-answer-keys.py first");
  }
  const answerData = JSON.parse(fs.readFileSync(ANSWER_KEYS, "utf8")) as {
    sources: OfficialAnswerRecord[];
  };
  const answersBySource = new Map(
    answerData.sources.map((source) => [source.sourceId, source]),
  );
  const scenarios: AuditScenario[] = [];

  for (const period of PERIODS) {
    const official = answersBySource.get(period.sourceId);
    if (!official) throw new Error(`${period.sourceId}: official answer vector is missing`);
    const answerCursor = { value: 0 };
    for (let major = 1; major <= 3; major += 1) {
      const url = `${MIRROR_BASE}/${period.mirrorPath}/pm${String(major).padStart(2, "0")}.html`;
      const scenario = parsePage(
        period,
        major,
        await fetchText(url),
        url,
        official.labels,
        answerCursor,
      );
      scenarios.push(scenario);
      console.log(`${scenario.id}: ${scenario.questions.length} answer units`);
    }
    if (answerCursor.value !== official.answerCount) {
      throw new Error(
        `${period.sourceId}: parsed ${answerCursor.value} answers, official vector has ${official.answerCount}`,
      );
    }
  }

  const questions = scenarios.flatMap((scenario) => scenario.questions);
  const figures = scenarios.flatMap((scenario) => [
    ...scenario.audit.figureMarkers,
    ...scenario.questions.flatMap((question) => question.audit.figureMarkers),
  ]);
  const uniqueFigureIds = new Set(figures.map((figure) => figure.id));
  const ids = new Set([...scenarios.map((scenario) => scenario.id), ...questions.map((question) => question.id)]);
  if (ids.size !== scenarios.length + questions.length) {
    throw new Error("Scenario or question IDs are duplicated");
  }
  if (scenarios.length !== 24 || questions.length !== 257) {
    throw new Error(`Expected 24 scenarios / 257 answer units, got ${scenarios.length} / ${questions.length}`);
  }
  if (figures.length !== 153 || uniqueFigureIds.size !== 151) {
    throw new Error(
      `Expected 153 PM figure references / 151 unique figures, got ${figures.length} / ${uniqueFigureIds.size}`,
    );
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        audit: {
          scenarioCount: scenarios.length,
          answerUnitCount: questions.length,
          answerMismatchCount: 0,
          figureReferenceCount: figures.length,
          uniqueFigureCount: uniqueFigureIds.size,
          reusedFigureReferenceCount: figures.length - uniqueFigureIds.size,
          factCheckAvailableCount: questions.filter((question) => question.audit.factCheckAvailable).length,
          officialOptionCorrectionIds: Object.keys(OFFICIAL_OPTION_CORRECTIONS),
        },
        scenarios,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(
    JSON.stringify(
      {
        scenarios: scenarios.length,
        answerUnits: questions.length,
        figureReferences: figures.length,
        uniqueFigures: uniqueFigureIds.size,
      },
      null,
      2,
    ),
  );
}

main().catch((reason: unknown) => {
  console.error(reason);
  process.exitCode = 1;
});
