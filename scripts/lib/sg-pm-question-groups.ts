import type { MarkdownImage } from "./dom-to-markdown";

export interface PmAnswerUnit {
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
    officialAnswer: string;
    transcriptionAnswer: string;
    answerSlot: string;
    transcriptionUrl: string;
    contentSha256: string;
    figureMarkers: MarkdownImage[];
    requiresOfficialFigure: boolean;
    factCheckAvailable: boolean;
    factCheckNotesSha256: string | null;
  };
}

export interface PmPlayableQuestion
  extends Omit<PmAnswerUnit, "type" | "answer" | "source" | "audit"> {
  type: "single-choice" | "multiple-choice";
  answer: number | number[];
  source: PmAnswerUnit["source"] & {
    /** Official answer-sheet slots represented by this playable question. */
    answerSlots?: string[];
  };
  audit: PmAnswerUnit["audit"] & {
    groupedUnitIds: string[];
    officialAnswers: string[];
    rawAnswerSlots: string[];
  };
}

export interface PmScenario<TQuestion = PmAnswerUnit> {
  id: string;
  title: string;
  scenario: string;
  domain: string;
  sourceId: string;
  majorQuestionNumber: string;
  questions: TQuestion[];
  audit: {
    transcriptionUrl: string;
    figureMarkers: MarkdownImage[];
  };
}

const TARGET_SLOT_SUFFIX = /\s*対象の解答欄：\d+\s*$/;

function playablePrompt(text: string): string {
  return text.replace(TARGET_SLOT_SUFFIX, "").trim();
}

function groupingKey(question: PmAnswerUnit): string {
  return `${playablePrompt(question.text)}\u0000${question.options.join("\u0001")}`;
}

function expectedSelectionCount(text: string): number | null {
  if (text.includes("三つ")) return 3;
  if (text.includes("二つ")) return 2;
  return null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function groupPmAnswerUnits(units: PmAnswerUnit[]): PmPlayableQuestion[] {
  const groups = new Map<string, PmAnswerUnit[]>();
  for (const unit of units) {
    const key = groupingKey(unit);
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const base = playablePrompt(first.text);
    const expectedCount = expectedSelectionCount(base);
    if (group.length > 1 && expectedCount !== group.length) {
      throw new Error(
        `${first.id}: repeated prompt has ${group.length} answer slots but asks for ${expectedCount ?? "an unknown count"}`,
      );
    }
    for (const unit of group.slice(1)) {
      if (
        unit.domain !== first.domain ||
        unit.source.sourceId !== first.source.sourceId ||
        unit.audit.transcriptionUrl !== first.audit.transcriptionUrl ||
        unit.audit.factCheckNotesSha256 !== first.audit.factCheckNotesSha256 ||
        !sameJson(unit.audit.figureMarkers, first.audit.figureMarkers)
      ) {
        throw new Error(`${first.id}: repeated prompt units do not share one source context`);
      }
    }

    const answers = group.map((unit) => unit.answer);
    if (new Set(answers).size !== answers.length) {
      throw new Error(`${first.id}: repeated prompt contains duplicate answer choices`);
    }
    const sourceAnswerSlots = group.map((unit) => unit.source.questionNumber);
    const rawAnswerSlots = group.map((unit) => unit.audit.answerSlot);
    const officialAnswers = group.map((unit) => unit.audit.officialAnswer);

    return {
      ...first,
      text: base,
      type: group.length === 1 ? "single-choice" : "multiple-choice",
      answer: group.length === 1 ? first.answer : answers,
      source: {
        ...first.source,
        questionNumber:
          group.length === 1
            ? first.source.questionNumber
            : sourceAnswerSlots.join("・"),
        ...(group.length > 1 ? { answerSlots: sourceAnswerSlots } : {}),
      },
      audit: {
        ...first.audit,
        groupedUnitIds: group.map((unit) => unit.id),
        officialAnswers,
        rawAnswerSlots,
      },
    };
  });
}

export function groupPmScenarios(
  scenarios: PmScenario[],
): PmScenario<PmPlayableQuestion>[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    questions: groupPmAnswerUnits(scenario.questions),
  }));
}
