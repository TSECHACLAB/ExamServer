import fs from "node:fs";
import path from "node:path";

import {
  loadCanonicalSgMorningPool,
  REVIEWED_DISTINCT_SIMILAR_PAIRS,
  REVIEWED_NEAR_DUPLICATE_PAIRS,
  REVIEWED_SEMANTIC_DUPLICATE_PAIRS,
} from "./lib/sg-canonical-pool";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIGURE_MANIFEST = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-am-figure-manifest.json",
);
const FIGURE_AUDIT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-am-figure-audit.json",
);
const EXPLANATIONS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-am-explanations.json",
);
const DEDUPLICATION_AUDIT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "sg-question-deduplication-audit.json",
);
const QUESTIONS_OUTPUT = path.join(ROOT, "data", "exams", "sg", "questions.json");
const SOURCES_OUTPUT = path.join(ROOT, "data", "exams", "sg", "sources.json");
const LABELS = ["ア", "イ", "ウ", "エ"];

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
  const groups = loadCanonicalSgMorningPool(ROOT);
  const figures = groups
    .map((group) => group.canonical)
    .filter((question) => question.audit?.requiresOfficialFigure)
    .map((question) => {
      const sourceId = question.source?.sourceId;
      const source = sourceId ? sourceById.get(sourceId) : undefined;
      if (!sourceId || !source?.questionPdf || !question.audit) {
        throw new Error(`${question.id}: figure source metadata is incomplete`);
      }
      return {
        id: question.id,
        sourceId,
        questionNumber: question.source!.questionNumber,
        transcriptionUrl: question.audit.transcriptionUrl,
        markerFiles: [...new Set(question.audit.figureMarkers)],
        officialPdf: source.questionPdf,
        output: `/exams/sg/legacy/${question.id}.png`,
      };
    });
  fs.mkdirSync(path.dirname(FIGURE_MANIFEST), { recursive: true });
  fs.writeFileSync(
    FIGURE_MANIFEST,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), figures }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${path.relative(ROOT, FIGURE_MANIFEST)} (${figures.length} figures)`);
}

function removeFigureMarkers(value: string): string {
  return value
    .replace(/\[\[OFFICIAL_FIGURE:[^\]]+\]\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeExplanationBody(value: string): string {
  return value
    .replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*(?:（[^\n]*）)?\*\*\s*/,
      "",
    )
    .replace(/^正解は「[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*」。\s*/, "")
    .replaceAll("\u00a0", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQuestions(write: boolean): void {
  const groups = loadCanonicalSgMorningPool(ROOT);
  const duplicateGroups = groups.filter((group) => group.members.length > 1);
  const removedOccurrenceCount = duplicateGroups.reduce(
    (count, group) => count + group.members.length - 1,
    0,
  );
  if (duplicateGroups.length !== 44 || removedOccurrenceCount !== 47) {
    throw new Error(
      `Expected 44 duplicate groups / 47 removed occurrences, found ${duplicateGroups.length} / ${removedOccurrenceCount}`,
    );
  }
  const explanationFile = JSON.parse(fs.readFileSync(EXPLANATIONS, "utf8")) as {
    items: { id: string; explanation: string }[];
  };
  const explanations = new Map(
    explanationFile.items.map((item) => [item.id, item.explanation]),
  );
  const figureFile = JSON.parse(fs.readFileSync(FIGURE_AUDIT, "utf8")) as {
    records: { id: string; output: string }[];
  };
  const figures = new Map(figureFile.records.map((record) => [record.id, record.output]));

  const missingExplanations: string[] = [];
  const missingFigures: string[] = [];
  const questions = groups.map((group) => {
    const canonical = group.canonical;
    const isLegacy = Boolean(canonical.audit);
    const explanation = isLegacy
      ? explanations.get(canonical.id)
      : canonical.explanation;
    if (!explanation) missingExplanations.push(canonical.id);
    if (isLegacy && typeof canonical.answer === "number") {
      const expectedPrefix = `**正解：${LABELS[canonical.answer]}**`;
      if (explanation && !explanation.startsWith(expectedPrefix)) {
        throw new Error(`${canonical.id}: explanation answer prefix is incorrect`);
      }
    }

    const requiresFigure = canonical.audit?.requiresOfficialFigure ?? false;
    const image = requiresFigure ? figures.get(canonical.id) : canonical.image;
    if (requiresFigure && !image) missingFigures.push(canonical.id);

    const primarySource = canonical.source;
    if (!primarySource) throw new Error(`${canonical.id}: primary source is missing`);
    const sourceOccurrences = group.members
      .filter((member) => member.source)
      .filter(
        (member) =>
          member.source!.sourceId !== primarySource.sourceId ||
          member.source!.questionNumber !== primarySource.questionNumber,
      )
      .map((member) => ({
        ...member.source!,
        originalAnswer: member.answer,
      }))
      .filter(
        (occurrence, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.sourceId === occurrence.sourceId &&
              candidate.questionNumber === occurrence.questionNumber,
          ) === index,
      );
    const options = canonical.options.map((option, index) => {
      const cleaned = removeFigureMarkers(option);
      return /^選択肢[アイウエ]$/.test(cleaned) || cleaned === ""
        ? LABELS[index]
        : cleaned;
    });

    return {
      id: canonical.id,
      style: canonical.style,
      type: canonical.type,
      text: removeFigureMarkers(canonical.text),
      ...(image ? { image } : {}),
      options,
      answer: canonical.answer,
      explanation: explanation ?? "",
      ...(canonical.domain ? { domain: canonical.domain } : {}),
      ...(group.domains.length > 1 ? { domains: group.domains } : {}),
      source: primarySource,
      ...(sourceOccurrences.length > 0 ? { sourceOccurrences } : {}),
    };
  });
  const explanationOwners = new Map<string, string[]>();
  for (const question of questions) {
    const body = normalizeExplanationBody(question.explanation);
    explanationOwners.set(body, [...(explanationOwners.get(body) ?? []), question.id]);
  }
  const duplicatedExplanationIds = [...explanationOwners.values()].filter(
    (ids) => ids.length > 1,
  );
  if (duplicatedExplanationIds.length > 0) {
    throw new Error(
      `Morning explanation bodies must be unique: ${duplicatedExplanationIds
        .map((ids) => ids.join(", "))
        .join("; ")}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        uniqueQuestionCount: questions.length,
        explanationCount: explanations.size,
        figureCount: figures.size,
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

  const questionsTemp = `${QUESTIONS_OUTPUT}.tmp`;
  fs.writeFileSync(questionsTemp, `${JSON.stringify({ questions }, null, 2)}\n`, "utf8");
  fs.renameSync(questionsTemp, QUESTIONS_OUTPUT);

  fs.writeFileSync(
    DEDUPLICATION_AUDIT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        candidateOccurrenceCount: 460,
        uniqueQuestionCount: groups.length,
        duplicateGroupCount: duplicateGroups.length,
        removedOccurrenceCount,
        reviewedNearDuplicatePairs: REVIEWED_NEAR_DUPLICATE_PAIRS,
        reviewedSemanticDuplicatePairs: REVIEWED_SEMANTIC_DUPLICATE_PAIRS,
        reviewedDistinctSimilarPairs: REVIEWED_DISTINCT_SIMILAR_PAIRS,
        groups: duplicateGroups.map((group) => ({
          canonicalId: group.canonical.id,
          memberIds: group.members.map((member) => member.id),
          sourceOccurrences: group.sourceOccurrences,
          domains: group.domains,
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
      kind: string;
      section: string;
      exerciseStatus: string;
      expectedQuestionNumbers?: string[];
      defaultModificationNote?: string;
      notes?: string;
    }[];
  };
  for (const source of registry.sources) {
    if (source.kind === "official-sample") {
      source.exerciseStatus = "excluded";
      source.notes =
        "実際に出題された公式過去問だけを本番プールへ含める方針のため、公式サンプルは参照資料として台帳だけに残しています。";
    } else if (source.section === "午前" && source.id.includes("-am")) {
      source.exerciseStatus = "complete";
      source.expectedQuestionNumbers = Array.from({ length: 50 }, (_, index) =>
        String(index + 1),
      );
      source.defaultModificationNote =
        "PDFの改行、句読点及び表をWeb演習向けに整形しています。問題の意味、選択肢及び正答は変更していません。";
      source.notes =
        "公式午前50問を全て収録しています。同一内容の再出題は一問に統合し、この資料での問番号と正答位置を出題履歴に保持しています。";
    }
  }
  const sourcesTemp = `${SOURCES_OUTPUT}.tmp`;
  fs.writeFileSync(sourcesTemp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  fs.renameSync(sourcesTemp, SOURCES_OUTPUT);
  console.log(
    `Wrote ${path.relative(ROOT, QUESTIONS_OUTPUT)}, ${path.relative(ROOT, SOURCES_OUTPUT)}, and ${path.relative(ROOT, DEDUPLICATION_AUDIT)}`,
  );
}

if (process.argv.includes("--figure-manifest")) {
  writeFigureManifest();
} else if (process.argv.includes("--status")) {
  buildQuestions(false);
} else if (process.argv.includes("--write")) {
  buildQuestions(true);
} else {
  throw new Error("Use --status, --figure-manifest, or --write");
}
