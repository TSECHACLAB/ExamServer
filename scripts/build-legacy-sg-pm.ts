import fs from "node:fs";
import path from "node:path";

import type { MarkdownImage } from "./lib/dom-to-markdown";
import {
  groupPmScenarios,
  type PmPlayableQuestion,
  type PmScenario,
} from "./lib/sg-pm-question-groups";

interface FigureManifestItem extends MarkdownImage {
  scenarioId: string;
  sourceId: string;
  majorQuestionNumber: string;
  ownerId: string;
  role: "scenario" | "question";
  transcriptionUrl: string;
  officialPdf: { url: string; sha256: string };
  output: string;
}

const ROOT = path.resolve(import.meta.dirname, "..");
const PM_AUDIT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-audit.json",
);
const FIGURE_MANIFEST = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-figure-manifest.json",
);
const FIGURE_AUDIT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-figure-audit.json",
);
const EXPLANATIONS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-explanations.json",
);
const MANUAL_EXPLANATIONS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-manual-explanations.json",
);
const EXPLANATION_CORRECTIONS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-explanation-corrections.json",
);
const GROUPING_AUDIT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-question-grouping-audit.json",
);
const SOURCES_OUTPUT = path.join(ROOT, "data", "exams", "sg", "sources.json");
const EXAM_DIR = path.join(ROOT, "data", "exams", "sg");
const LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const EXPLANATION_PROMPT_VERSION = 14;

function loadStagedScenarios(): PmScenario[] {
  const value = JSON.parse(fs.readFileSync(PM_AUDIT, "utf8")) as {
    scenarios: PmScenario[];
  };
  return value.scenarios;
}

function writeFigureManifest(): void {
  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data", "exams", "sg", "sources.json"), "utf8"),
  ) as {
    sources: {
      id: string;
      questionPdf?: { url: string; sha256: string };
    }[];
  };
  const sourceById = new Map(registry.sources.map((source) => [source.id, source]));
  const figures: FigureManifestItem[] = [];

  for (const scenario of loadStagedScenarios()) {
    const source = sourceById.get(scenario.sourceId);
    if (!source?.questionPdf) {
      throw new Error(`${scenario.sourceId}: official question PDF is missing`);
    }
    const append = (
      image: MarkdownImage,
      ownerId: string,
      role: "scenario" | "question",
      transcriptionUrl: string,
    ): void => {
      figures.push({
        ...image,
        scenarioId: scenario.id,
        sourceId: scenario.sourceId,
        majorQuestionNumber: scenario.majorQuestionNumber,
        ownerId,
        role,
        transcriptionUrl,
        officialPdf: source.questionPdf!,
        output: `/exams/sg/legacy/pm/${image.id}.png`,
      });
    };
    for (const image of scenario.audit.figureMarkers) {
      append(image, scenario.id, "scenario", scenario.audit.transcriptionUrl);
    }
    for (const question of scenario.questions) {
      for (const image of question.audit.figureMarkers) {
        if (figures.some((figure) => figure.id === image.id)) continue;
        append(image, question.id, "question", question.audit.transcriptionUrl);
      }
    }
  }

  if (figures.length !== 151 || new Set(figures.map((figure) => figure.id)).size !== figures.length) {
    throw new Error(`Expected 151 unique PM figures, found ${figures.length}`);
  }
  fs.mkdirSync(path.dirname(FIGURE_MANIFEST), { recursive: true });
  fs.writeFileSync(
    FIGURE_MANIFEST,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), figures }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${path.relative(ROOT, FIGURE_MANIFEST)} (${figures.length} figures)`);
}

function loadOptionalMap<T extends { id: string }>(
  filePath: string,
  property: "items" | "records",
): Map<string, T> {
  if (!fs.existsSync(filePath)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
    string,
    T[]
  >;
  return new Map((parsed[property] ?? []).map((item) => [item.id, item]));
}

function replaceFigureMarkers(
  value: string,
  figures: Map<string, { output: string }>,
  manifest: Map<string, FigureManifestItem>,
): string {
  return value
    .replace(/\[\[OFFICIAL_FIGURE:([^\]]+)\]\]/g, (_marker, id: string) => {
      const figure = figures.get(id);
      const metadata = manifest.get(id);
      if (!figure || !metadata) return `[[OFFICIAL_FIGURE:${id}]]`;
      return `![${metadata.alt}](${figure.output})`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim();
}

function normalizeExplanationBody(value: string): string {
  return normalizeWhitespace(
    value.replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*(?:（[^\n]*）)?\*\*\s*/,
      "",
    ),
  );
}

function hasRepeatedLongPhrase(value: string, windowLength = 18): boolean {
  const normalized = value
    .normalize("NFKC")
    .replace(
      /^[*]*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*[*]*\s*/,
      "",
    )
    .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】*]/g, "");
  for (let index = 0; index <= normalized.length - windowLength; index += 1) {
    const phrase = normalized.slice(index, index + windowLength);
    if (normalized.indexOf(phrase, index + windowLength) >= 0) return true;
  }
  return false;
}

function validateExplanation(
  question: PmPlayableQuestion,
  explanation: string,
): void {
  const answerIndexes = Array.isArray(question.answer)
    ? question.answer
    : [question.answer];
  const correctLabel = answerIndexes.map((answer) => LABELS[answer]).join("・");
  if (!explanation.startsWith(`**正解：${correctLabel}**`)) {
    throw new Error(`${question.id}: explanation answer prefix is incorrect`);
  }
  if (explanation.length < 80 || explanation.length > 700) {
    throw new Error(`${question.id}: explanation length is ${explanation.length}`);
  }
  if (/sg-siken|過去問道場|確認メモ|参照メモ|sourceEvidence|上記の情報|与えられた情報/i.test(explanation)) {
    throw new Error(`${question.id}: explanation exposes an internal aid`);
  }
  const sentences = explanation
    .replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*\*\*\s*/,
      "",
    )
    .split(/[。！？\n]/)
    .map(normalizeWhitespace)
    .filter((sentence) => sentence.length >= 16);
  if (new Set(sentences).size !== sentences.length) {
    throw new Error(`${question.id}: explanation repeats a sentence`);
  }
  if (hasRepeatedLongPhrase(explanation)) {
    throw new Error(`${question.id}: explanation repeats a long phrase`);
  }
  if (/(?:他の|それ以外の)(?:選択肢|グループ|案|項目)/.test(explanation)) {
    throw new Error(`${question.id}: explanation groups distractors generically`);
  }
  if (
    /(?:他の|それ以外の)選択肢.{0,65}(?:関係がない|記載されていない|該当しない|一致しない|形式が異なる|適切でない|不適切|誤りである|合わない)/.test(
      explanation,
    )
  ) {
    throw new Error(`${question.id}: explanation dismisses choices generically`);
  }
  if (
    question.audit.requiresOfficialFigure &&
    /誤答の例|(?:他の|それ以外の)(?:選択肢|グループ|案|項目)|選択肢[アイウエオカキクケコ]/.test(explanation)
  ) {
    throw new Error(`${question.id}: figure explanation invents unseen distractors`);
  }
}

function buildScenarios(write: boolean): void {
  const rawStaged = loadStagedScenarios();
  const staged = groupPmScenarios(rawStaged);
  if (fs.existsSync(EXPLANATIONS)) {
    const metadata = JSON.parse(fs.readFileSync(EXPLANATIONS, "utf8")) as {
      promptVersion?: number;
    };
    if (metadata.promptVersion !== EXPLANATION_PROMPT_VERSION) {
      throw new Error(
        `Generated PM explanations must use prompt v${EXPLANATION_PROMPT_VERSION}`,
      );
    }
  }
  const explanationMap = loadOptionalMap<{ id: string; explanation: string }>(
    EXPLANATIONS,
    "items",
  );
  const manualExplanationMap = loadOptionalMap<{ id: string; explanation: string }>(
    MANUAL_EXPLANATIONS,
    "items",
  );
  const correctionMap = loadOptionalMap<{
    id: string;
    explanation: string;
    reason: string;
  }>(EXPLANATION_CORRECTIONS, "items");
  const generatedExplanationCount = explanationMap.size;
  for (const [id, item] of manualExplanationMap) {
    if (explanationMap.has(id)) {
      throw new Error(`${id}: generated and manually reviewed explanations overlap`);
    }
    explanationMap.set(id, item);
  }
  for (const [id, correction] of correctionMap) {
    if (!explanationMap.has(id)) {
      throw new Error(`${id}: correction has no generated or manual explanation`);
    }
    if (!normalizeWhitespace(correction.reason)) {
      throw new Error(`${id}: correction reason is empty`);
    }
    explanationMap.set(id, correction);
  }
  const figureMap = loadOptionalMap<{ id: string; output: string }>(
    FIGURE_AUDIT,
    "records",
  );
  const manifestFile = fs.existsSync(FIGURE_MANIFEST)
    ? (JSON.parse(fs.readFileSync(FIGURE_MANIFEST, "utf8")) as {
        figures: FigureManifestItem[];
      })
    : { figures: [] };
  const manifestMap = new Map(
    manifestFile.figures.map((figure) => [figure.id, figure]),
  );
  const requiredFigureIds = new Set(
    staged.flatMap((scenario) => [
      ...scenario.audit.figureMarkers.map((figure) => figure.id),
      ...scenario.questions.flatMap((question) =>
        question.audit.figureMarkers.map((figure) => figure.id),
      ),
    ]),
  );
  const rawAnswerUnits = rawStaged.flatMap((scenario) => scenario.questions);
  const questions = staged.flatMap((scenario) => scenario.questions);
  const groupedQuestions = questions.filter(
    (question) => question.audit.groupedUnitIds.length > 1,
  );
  const groupedAnswerUnitCount = groupedQuestions.reduce(
    (count, question) => count + question.audit.groupedUnitIds.length,
    0,
  );
  const removedRepeatedScreenCount = rawAnswerUnits.length - questions.length;
  if (
    groupedQuestions.length !== 8 ||
    groupedAnswerUnitCount !== 18 ||
    removedRepeatedScreenCount !== 10
  ) {
    throw new Error(
      `Expected 8 grouped PM questions / 18 answer units / 10 removed screens, got ${groupedQuestions.length} / ${groupedAnswerUnitCount} / ${removedRepeatedScreenCount}`,
    );
  }
  const questionIds = new Set(questions.map((question) => question.id));
  const unexpectedExplanationIds = [...explanationMap.keys()].filter(
    (id) => !questionIds.has(id),
  );
  if (unexpectedExplanationIds.length > 0) {
    throw new Error(
      `Unexpected PM explanation IDs: ${unexpectedExplanationIds.join(", ")}`,
    );
  }
  const duplicateExplanationBodies = [...explanationMap.values()]
    .map((item) => normalizeExplanationBody(item.explanation))
    .filter((body, index, all) => all.indexOf(body) !== index);
  if (duplicateExplanationBodies.length > 0) {
    throw new Error("PM explanation bodies must be unique");
  }
  const missingExplanations = questions
    .filter((question) => !explanationMap.has(question.id))
    .map((question) => question.id);
  const missingFigures = [...requiredFigureIds].filter((id) => !figureMap.has(id));

  const outputScenarios = staged.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    scenario: replaceFigureMarkers(
      scenario.scenario,
      figureMap,
      manifestMap,
    ),
    questions: scenario.questions.map((question) => {
      const explanation = explanationMap.get(question.id)?.explanation ?? "";
      if (explanation) validateExplanation(question, explanation);
      const promptText = replaceFigureMarkers(
        question.text,
        figureMap,
        manifestMap,
      );
      const options = question.options.map((option, index) =>
        /^選択肢[アイウエオカキクケコ]$/.test(option) ? LABELS[index] : option,
      );
      return {
        id: question.id,
        style: question.style,
        type: question.type,
        ...(Array.isArray(question.answer)
          ? { selectionLimit: question.answer.length }
          : {}),
        text: promptText,
        options,
        answer: question.answer,
        explanation,
        domain: question.domain,
        source: {
          sourceId: question.source.sourceId,
          questionNumber: question.source.questionNumber,
          modified: question.source.modified,
        },
      };
    }),
  }));

  console.log(
    JSON.stringify(
      {
        scenarioCount: outputScenarios.length,
        officialAnswerUnitCount: rawAnswerUnits.length,
        playableQuestionCount: questions.length,
        groupedQuestionCount: groupedQuestions.length,
        groupedAnswerUnitCount,
        removedRepeatedScreenCount,
        explanationCount: explanationMap.size,
        generatedExplanationCount,
        manualExplanationCount: manualExplanationMap.size,
        correctedExplanationCount: correctionMap.size,
        figureCount: figureMap.size,
        missingExplanationCount: missingExplanations.length,
        missingFigureCount: missingFigures.length,
      },
      null,
      2,
    ),
  );
  if (!write) return;
  if (missingExplanations.length > 0 || missingFigures.length > 0) {
    throw new Error(
      `Build blocked: ${missingExplanations.length} explanations and ${missingFigures.length} figures are missing`,
    );
  }
  for (const scenario of outputScenarios) {
    const output = path.join(EXAM_DIR, `scenario-${scenario.id}.json`);
    const temp = `${output}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
    fs.renameSync(temp, output);
  }

  fs.writeFileSync(
    GROUPING_AUDIT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        officialAnswerUnitCount: rawAnswerUnits.length,
        playableQuestionCount: questions.length,
        groupedQuestionCount: groupedQuestions.length,
        groupedAnswerUnitCount,
        removedRepeatedScreenCount,
        groups: groupedQuestions.map((question) => ({
          playableQuestionId: question.id,
          sourceId: question.source.sourceId,
          sourceAnswerSlots: question.source.answerSlots,
          rawAnswerSlots: question.audit.rawAnswerSlots,
          groupedUnitIds: question.audit.groupedUnitIds,
          officialAnswers: question.audit.officialAnswers,
          answerIndexes: question.answer,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const registry = JSON.parse(fs.readFileSync(SOURCES_OUTPUT, "utf8")) as {
    sources: {
      id: string;
      section: string;
      exerciseStatus: string;
      publishedMajorQuestionCount?: number;
      publishedQuestionCount: number;
      playableQuestionCount?: number;
      expectedQuestionNumbers?: string[];
      defaultModificationNote?: string;
      notes?: string;
    }[];
  };
  for (const source of registry.sources.filter((item) => item.section === "午後")) {
    const sourceAnswerUnits = rawAnswerUnits.filter(
      (question) => question.source.sourceId === source.id,
    );
    const sourceQuestions = questions.filter(
      (question) => question.source.sourceId === source.id,
    );
    if (sourceQuestions.length === 0) continue;
    source.exerciseStatus = "complete";
    source.publishedMajorQuestionCount = 3;
    source.publishedQuestionCount = sourceAnswerUnits.length;
    source.playableQuestionCount = sourceQuestions.length;
    source.expectedQuestionNumbers = sourceAnswerUnits.map(
      (question) => question.source.questionNumber,
    );
    source.defaultModificationNote =
      "PDFの改行、句読点及び表をWeb演習向けに整形しています。同じ設問で複数の解答欄を使う問題は、元の指示どおり複数選択問題としてまとめています。";
    source.notes =
      `公式の大問3問、解答欄${sourceAnswerUnits.length}個を、元の解答形式を保った${sourceQuestions.length}問として収録しています。`;
  }
  const sourcesTemp = `${SOURCES_OUTPUT}.tmp`;
  fs.writeFileSync(sourcesTemp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  fs.renameSync(sourcesTemp, SOURCES_OUTPUT);
  console.log(
    `Wrote ${outputScenarios.length} scenario files, ${path.relative(ROOT, GROUPING_AUDIT)}, and ${path.relative(ROOT, SOURCES_OUTPUT)}`,
  );
}

if (process.argv.includes("--figure-manifest")) {
  writeFigureManifest();
} else if (process.argv.includes("--status")) {
  buildScenarios(false);
} else if (process.argv.includes("--write")) {
  buildScenarios(true);
} else {
  throw new Error("Use --figure-manifest, --status, or --write");
}
