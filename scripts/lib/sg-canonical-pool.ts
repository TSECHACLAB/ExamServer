import fs from "node:fs";
import path from "node:path";

export interface SourceReference {
  sourceId: string;
  questionNumber: string;
  modified: boolean;
  modificationNote?: string;
  originalAnswer?: number | number[];
}

export interface StagedQuestion {
  id: string;
  style: "oneshot" | "scenario";
  type: "single-choice" | "multiple-choice";
  text: string;
  image?: string | null;
  options: string[];
  answer: number | number[];
  explanation?: string;
  domain?: string;
  source?: SourceReference;
  audit?: {
    transcriptionUrl: string;
    figureMarkers: string[];
    requiresOfficialFigure: boolean;
  };
}

export interface CanonicalGroup {
  canonical: StagedQuestion;
  members: StagedQuestion[];
  sourceOccurrences: SourceReference[];
  domains: string[];
}

export const REVIEWED_NEAR_DUPLICATE_PAIRS = [
  ["sg-2019-autumn-am-q07", "sg-2018-spring-am-q10"],
  ["sg-2019-autumn-am-q30", "sg-2017-spring-am-q30"],
  ["sg-2019-spring-am-q02", "sg-2017-autumn-am-q03"],
  ["sg-2019-autumn-am-q05", "sg-2017-autumn-am-q10"],
  ["sg-2019-spring-am-q11", "sg-2016-autumn-am-q16"],
  ["sg-2018-autumn-am-q18", "sg-2016-autumn-am-q19"],
  ["sg-2018-autumn-am-q01", "sg-2017-spring-am-q03"],
  ["sg-2018-autumn-am-q14", "sg-2016-autumn-am-q12"],
  ["sg-2019-spring-am-q33", "sg-2017-autumn-am-q32"],
  ["sg-2019-autumn-am-q24", "sg-2018-spring-am-q25"],
  ["sg-2019-autumn-am-q20", "sg-2017-spring-am-q22"],
  ["sg-2019-autumn-am-q22", "sg-2018-spring-am-q23"],
  ["sg-2019-autumn-am-q17", "sg-2016-spring-am-q28"],
  ["sg-2019-autumn-am-q15", "sg-2017-autumn-am-q21"],
  ["sg-2018-autumn-am-q22", "sg-r06-q06"],
  ["sg-2017-autumn-am-q31", "sg-r06-q07"],
  ["sg-2016-spring-am-q46", "sg-r06-q10"],
  ["sg-2018-autumn-am-q11", "sg-r06-q02"],
] as const;

// The wording distance of these official reprints is larger than the trigram
// threshold, but a manual comparison confirmed that the question, every
// choice's meaning, and the correct answer are equivalent.  Keep the list
// explicit so a future content change cannot silently merge a new pair.
export const REVIEWED_SEMANTIC_DUPLICATE_PAIRS = [
  ["sg-r05-q08", "sg-2017-spring-am-q31"],
  ["sg-2018-autumn-am-q21", "sg-2016-spring-am-q19"],
  ["sg-2019-autumn-am-q10", "sg-2017-autumn-am-q16"],
  ["sg-2019-autumn-am-q11", "sg-2017-autumn-am-q17"],
  ["sg-r07-q04", "sg-2017-spring-am-q27"],
  ["sg-2018-autumn-am-q30", "sg-2017-spring-am-q29"],
  ["sg-2019-spring-am-q05", "sg-2017-autumn-am-q06"],
  ["sg-2018-spring-am-q30", "sg-2016-autumn-am-q29"],
  ["sg-r08-q02", "sg-2018-autumn-am-q01"],
  ["sg-2018-spring-am-q38", "sg-2016-autumn-am-q37"],
  ["sg-2019-autumn-am-q31", "sg-2018-spring-am-q32"],
  ["sg-2019-spring-am-q47", "sg-2016-autumn-am-q48"],
  ["sg-2019-autumn-am-q03", "sg-2016-spring-am-q05"],
] as const;

// This pair is deliberately kept separate: one asks for the definition of
// risk analysis, while the other asks for risk evaluation.  The choices are
// similar because both terms belong to the same risk-assessment vocabulary.
export const REVIEWED_DISTINCT_SIMILAR_PAIRS = [
  ["sg-2018-autumn-am-q07", "sg-2018-spring-am-q03"],
] as const;

const REVIEWED_REORDERED_ANSWER_PAIRS = new Set([
  pairKey("sg-2019-spring-am-q05", "sg-2017-autumn-am-q06"),
]);
const CURRENT_PUBLIC_SOURCE_IDS = new Set([
  "ipa-sg-2023-r05",
  "ipa-sg-2024-r06",
  "ipa-sg-2025-r07",
  "ipa-sg-2026-r08",
]);

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】]/g, "");
}

function contentKey(question: StagedQuestion): string {
  return `${normalize(question.text)}\u0000${question.options
    .map(normalize)
    .sort()
    .join("\u0001")}`;
}

function correctOptionKey(question: StagedQuestion): string {
  const answerIndexes = Array.isArray(question.answer)
    ? question.answer
    : [question.answer];
  return answerIndexes
    .map((index) => normalize(question.options[index]))
    .sort()
    .join("\u0001");
}

function trigrams(question: StagedQuestion): Set<string> {
  const value = normalize(`${question.text}\n${question.options.join("\n")}`);
  const output = new Set<string>();
  for (let index = 0; index < value.length - 2; index += 1) {
    output.add(value.slice(index, index + 3));
  }
  return output;
}

function similarity(left: Set<string>, right: Set<string>): number {
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index]);
    }
    return this.parent[index];
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot;
  }
}

export function loadCanonicalSgMorningPool(root: string): CanonicalGroup[] {
  const registry = JSON.parse(
    fs.readFileSync(path.join(root, "data", "exams", "sg", "sources.json"), "utf8"),
  ) as { sources: { id: string; kind: string }[] };
  const sourceKind = new Map(registry.sources.map((source) => [source.id, source.kind]));
  const live = JSON.parse(
    fs.readFileSync(path.join(root, "data", "exams", "sg", "questions.json"), "utf8"),
  ) as { questions: StagedQuestion[] };
  const currentPast = live.questions.filter(
    (question) =>
      question.source &&
      sourceKind.get(question.source.sourceId) === "official-past" &&
      CURRENT_PUBLIC_SOURCE_IDS.has(question.source.sourceId),
  );
  const legacyAudit = JSON.parse(
    fs.readFileSync(
      path.join(root, "artifacts", "question-content", "legacy-sg-am-audit.json"),
      "utf8",
    ),
  ) as { questions: StagedQuestion[] };

  // Priority is deliberate: current public questions first, followed by legacy
  // periods in the newest-to-oldest order emitted by the audit script.
  const questions = [...currentPast, ...legacyAudit.questions];
  const byId = new Map(questions.map((question, index) => [question.id, index]));
  if (byId.size !== questions.length) throw new Error("SG candidate question IDs are not unique");

  const sets = new DisjointSet(questions.length);
  const exactOwners = new Map<string, number>();
  for (let index = 0; index < questions.length; index += 1) {
    const key = contentKey(questions[index]);
    const owner = exactOwners.get(key);
    if (owner === undefined) exactOwners.set(key, index);
    else sets.union(owner, index);
  }

  const reviewed = new Set(
    REVIEWED_NEAR_DUPLICATE_PAIRS.map(([left, right]) => pairKey(left, right)),
  );
  const grams = questions.map(trigrams);
  const observedNear = new Set<string>();
  for (let left = 0; left < questions.length; left += 1) {
    for (let right = left + 1; right < questions.length; right += 1) {
      if (contentKey(questions[left]) === contentKey(questions[right])) continue;
      if (similarity(grams[left], grams[right]) < 0.82) continue;
      const key = pairKey(questions[left].id, questions[right].id);
      observedNear.add(key);
      if (!reviewed.has(key)) {
        throw new Error(
          `Unreviewed near-duplicate pair: ${questions[left].id} / ${questions[right].id}`,
        );
      }
    }
  }
  for (const key of reviewed) {
    const [leftId, rightId] = key.split("\u0000");
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (left === undefined || right === undefined) {
      throw new Error(`Reviewed duplicate question is missing: ${leftId} / ${rightId}`);
    }
    if (
      !observedNear.has(key) &&
      contentKey(questions[left]) !== contentKey(questions[right])
    ) {
      throw new Error(`Reviewed duplicate pair no longer matches: ${key}`);
    }
    sets.union(left, right);
  }
  for (const [leftId, rightId] of REVIEWED_SEMANTIC_DUPLICATE_PAIRS) {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (left === undefined || right === undefined) {
      throw new Error(`Reviewed semantic duplicate is missing: ${leftId} / ${rightId}`);
    }
    sets.union(left, right);
  }
  for (const [leftId, rightId] of REVIEWED_DISTINCT_SIMILAR_PAIRS) {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (left === undefined || right === undefined) {
      throw new Error(`Reviewed distinct pair is missing: ${leftId} / ${rightId}`);
    }
    if (
      contentKey(questions[left]) === contentKey(questions[right]) ||
      correctOptionKey(questions[left]) === correctOptionKey(questions[right])
    ) {
      throw new Error(`Reviewed distinct pair must remain meaningfully different: ${leftId} / ${rightId}`);
    }
  }

  const memberIndexes = new Map<number, number[]>();
  for (let index = 0; index < questions.length; index += 1) {
    const rootIndex = sets.find(index);
    memberIndexes.set(rootIndex, [...(memberIndexes.get(rootIndex) ?? []), index]);
  }

  const groups = [...memberIndexes.values()]
    .map((indexes) => indexes.sort((left, right) => left - right))
    .sort((left, right) => left[0] - right[0])
    .map((indexes): CanonicalGroup => {
      const members = indexes.map((index) => questions[index]);
      const canonical = members[0];
      const expectedAnswer = correctOptionKey(canonical);
      for (const member of members.slice(1)) {
        if (
          correctOptionKey(member) !== expectedAnswer &&
          JSON.stringify(member.answer) !== JSON.stringify(canonical.answer) &&
          !REVIEWED_REORDERED_ANSWER_PAIRS.has(pairKey(canonical.id, member.id))
        ) {
          throw new Error(
            `Duplicate answer meaning differs: ${canonical.id} / ${member.id}`,
          );
        }
      }
      const sourceOccurrences = members
        .map((member) => member.source)
        .filter((source): source is SourceReference => Boolean(source))
        .filter(
          (source, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.sourceId === source.sourceId &&
                candidate.questionNumber === source.questionNumber,
            ) === index,
        );
      const domains = members
        .map((member) => member.domain)
        .filter((domain): domain is string => Boolean(domain))
        .filter((domain, index, all) => all.indexOf(domain) === index);
      return { canonical, members, sourceOccurrences, domains };
    });

  if (currentPast.length !== 60) {
    throw new Error(`Expected 60 current official-past questions, found ${currentPast.length}`);
  }
  if (legacyAudit.questions.length !== 400) {
    throw new Error(`Expected 400 legacy morning questions, found ${legacyAudit.questions.length}`);
  }
  if (groups.length !== 413) {
    throw new Error(`Expected 413 unique current + legacy morning questions, found ${groups.length}`);
  }
  return groups;
}
