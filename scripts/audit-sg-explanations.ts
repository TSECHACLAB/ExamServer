import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type ReviewStatus = "pass" | "issue" | "uncertain";
type DimensionStatus = "pass" | "fail" | "uncertain";

interface QuestionSource {
  sourceId: string;
  questionNumber: string;
}

interface LiveQuestion {
  id: string;
  style: "oneshot" | "scenario";
  type: "single-choice" | "multiple-choice";
  text: string;
  options: string[];
  answer: number | number[];
  explanation: string;
  source: QuestionSource;
}

interface LiveScenario {
  id: string;
  title: string;
  scenario: string;
  questions: LiveQuestion[];
}

interface DeterministicFinding {
  code: string;
  detail: string;
}

interface AuditEntry {
  id: string;
  cohort: "current" | "legacy-am" | "legacy-pm";
  scenarioId?: string;
  scenarioContext?: string;
  problem: string;
  options: string[];
  correctLabels: string[];
  correctOptions: string[];
  explanation: string;
  deterministicIssues: DeterministicFinding[];
  qualitySignals: string[];
}

interface ReviewResult {
  id: string;
  status: ReviewStatus;
  correctness: DimensionStatus;
  specificity: DimensionStatus;
  remediation: DimensionStatus;
  completeness: DimensionStatus;
  clarity: DimensionStatus;
  issues: string[];
  evidence: string;
  suggestedFix: string;
}

interface AuditedReviewResult extends ReviewResult {
  inputSha256: string;
}

interface ManualAdjudication {
  id: string;
  inputSha256: string;
  status: "pass";
  reason: string;
  evidence: string;
  sourceImage?: {
    path: string;
    sha256: string;
  };
  sourceAudit?: {
    path: string;
    contentSha256: string;
  };
}

interface ManualAdjudicationFile {
  reviewedAt: string;
  method: string;
  items: ManualAdjudication[];
}

interface AuditFile {
  generatedAt: string;
  model: string;
  reviewVersion: number;
  explanationInputSha256: string;
  expectedReviewCount: number;
  deterministicReviewCount: number;
  deterministicIssueCount: number;
  manualAdjudicationCount: number;
  manualAdjudications: ManualAdjudication[];
  deterministicFindings: {
    id: string;
    issues: DeterministicFinding[];
    qualitySignals: string[];
  }[];
  items: AuditedReviewResult[];
  summary: {
    reviewedCount: number;
    passCount: number;
    issueCount: number;
    uncertainCount: number;
    unreviewedCount: number;
    issueIds: string[];
    uncertainIds: string[];
  };
}

const ROOT = path.resolve(import.meta.dirname, "..");
const EXAM_DIR = path.join(ROOT, "data", "exams", "sg");
const OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "sg-explanation-quality-audit.json",
);
const ADJUDICATIONS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "sg-explanation-quality-adjudications.json",
);
const LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const MODEL = process.env.SG_EXPLANATION_REVIEW_MODEL ?? "gpt-oss:20b";
const REVIEW_VERSION = 2;
const ONESHOT_BATCH_SIZE = Number(process.env.SG_EXPLANATION_REVIEW_BATCH_SIZE ?? 8);
const RESTART = process.argv.includes("--restart");
const CHECK_ONLY = process.argv.includes("--check");
const LIMIT_ARGUMENT = process.argv.find((argument) => argument.startsWith("--limit="));
const LIMIT = LIMIT_ARGUMENT ? Number(LIMIT_ARGUMENT.split("=")[1]) : Number.POSITIVE_INFINITY;
const INTERNAL_AID_PATTERN =
  /sg-siken|過去問道場|確認メモ|参照メモ|転記サイト|factCheck|transcription|生成モデル/i;
const DECISIVE_REASON_PATTERN = /ため|ので|ことから|に該当|この場合|したがって|つまり|一方|対して/;
const DISTRACTOR_PATTERN =
  /誤り|適切では|該当しない|一方|これに対し|選択肢[アイウエオカキクケコ]|[アイウエオカキクケコ]は/;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function answerIndexes(question: LiveQuestion): number[] {
  return Array.isArray(question.answer) ? question.answer : [question.answer];
}

function correctLabels(question: LiveQuestion): string[] {
  return answerIndexes(question).map((index) => LABELS[index]);
}

function explanationBody(explanation: string): string {
  return explanation
    .replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*(?:（[^\n]*）)?\*\*\s*/,
      "",
    )
    .replace(
      /^正解は[「"]?[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*[」"]?[。．]?\s*/,
      "",
    )
    .trim();
}

function explanationHeaderLabels(explanation: string): string[] | null {
  const markdown = explanation.match(
    /^\*\*正解：([アイウエオカキクケコ](?:・[アイウエオカキクケコ])*)(?:（[^\n]*）)?\*\*/,
  );
  if (markdown) return markdown[1].split("・");
  const legacy = explanation.match(
    /^正解は[「"]?([アイウエオカキクケコ](?:・[アイウエオカキクケコ])*)[」"]?[。．]?/,
  );
  return legacy ? legacy[1].split("・") : null;
}

function normalizedBody(explanation: string): string {
  return explanationBody(explanation)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】*]/g, "");
}

function loadQuestions(): {
  entries: AuditEntry[];
  scenarios: LiveScenario[];
} {
  const morning = JSON.parse(
    fs.readFileSync(path.join(EXAM_DIR, "questions.json"), "utf8"),
  ) as { questions: LiveQuestion[] };
  const scenarios = fs
    .readdirSync(EXAM_DIR)
    .filter((name) => /^scenario-.*\.json$/.test(name))
    .sort()
    .map(
      (name) =>
        JSON.parse(fs.readFileSync(path.join(EXAM_DIR, name), "utf8")) as LiveScenario,
    );
  const entries: AuditEntry[] = [
    ...morning.questions.map((question) => buildEntry(question)),
    ...scenarios.flatMap((scenario) =>
      scenario.questions.map((question) => buildEntry(question, scenario)),
    ),
  ];
  if (morning.questions.length !== 413 || scenarios.length !== 24) {
    throw new Error(
      `Expected 413 morning questions and 24 PM scenarios, found ${morning.questions.length} and ${scenarios.length}`,
    );
  }
  if (entries.length !== 660) {
    throw new Error(`Expected 660 live SG questions, found ${entries.length}`);
  }
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error("Live SG question IDs are not unique");
  addDuplicateFindings(entries);
  return { entries, scenarios };
}

function buildEntry(question: LiveQuestion, scenario?: LiveScenario): AuditEntry {
  const labels = correctLabels(question);
  const indexes = answerIndexes(question);
  const body = explanationBody(question.explanation);
  const deterministicIssues: DeterministicFinding[] = [];
  const qualitySignals: string[] = [];
  const headingLabels = explanationHeaderLabels(question.explanation);
  if (!headingLabels) {
    deterministicIssues.push({
      code: "answer-prefix",
      detail: "解説冒頭に正答見出しがない",
    });
  } else if (JSON.stringify(headingLabels) !== JSON.stringify(labels)) {
    deterministicIssues.push({
      code: "answer-prefix",
      detail: `解説見出し ${headingLabels.join("・")} が公式正答 ${labels.join("・")} と一致しない`,
    });
  }
  if (!body) {
    deterministicIssues.push({ code: "empty-body", detail: "解説本文が空" });
  }
  if (body.length < 90) qualitySignals.push(`本文が短い（${body.length}字）`);
  if ((body.match(/[。！？]/g) ?? []).length < 2) {
    qualitySignals.push("説明が一文だけで終わる");
  }
  if (!DECISIVE_REASON_PATTERN.test(body)) {
    qualitySignals.push("決め手を示す接続が見当たらない");
  }
  if (question.style === "oneshot" && !DISTRACTOR_PATTERN.test(body)) {
    qualitySignals.push("主要誤答との差が明示されていない");
  }
  if (INTERNAL_AID_PATTERN.test(question.explanation)) {
    deterministicIssues.push({
      code: "internal-aid",
      detail: "利用者に見せない照合資料又は生成情報が含まれる",
    });
  }
  if (/──|[🚀🎯✨💡]/u.test(question.explanation)) {
    deterministicIssues.push({
      code: "style-artifact",
      detail: "解説に不要な装飾記号が含まれる",
    });
  }
  for (const stated of statedCorrectLabels(body)) {
    if (stated.some((label) => !labels.includes(label))) {
      deterministicIssues.push({
        code: "contradictory-label",
        detail: `本文が ${stated.join("・")} を正解又は適切と断定している`,
      });
    }
  }
  for (let index = 0; index < question.options.length; index += 1) {
    if (indexes.includes(index)) continue;
    const option = question.options[index].trim();
    if (option.length < 2 || option.length > 48 || /^選択肢[アイウエオカキクケコ]$/.test(option)) {
      continue;
    }
    const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`${escaped}(?:が|は)(?:最も)?(?:適切|正解|正答)`).test(body)) {
      deterministicIssues.push({
        code: "wrong-option-endorsed",
        detail: `誤答「${option}」を適切又は正解と断定している`,
      });
    }
  }
  return {
    id: question.id,
    cohort: scenario
      ? "legacy-pm"
      : question.id.startsWith("sg-r")
        ? "current"
        : "legacy-am",
    ...(scenario ? { scenarioId: scenario.id, scenarioContext: scenario.scenario } : {}),
    problem: question.text,
    options: question.options.map((option, index) => `${LABELS[index]} ${option}`),
    correctLabels: labels,
    correctOptions: indexes.map((index) => question.options[index]),
    explanation: question.explanation,
    deterministicIssues,
    qualitySignals,
  };
}

function statedCorrectLabels(body: string): string[][] {
  const output: string[][] = [];
  const patterns = [
    /([アイウエオカキクケコ](?:・[アイウエオカキクケコ])*)[がは](?:最も)?(?:正解|正答|適切)(?:です|である|となる|だ)/g,
    /(?:正解|正答)は([アイウエオカキクケコ](?:・[アイウエオカキクケコ])*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) output.push(match[1].split("・"));
  }
  return output;
}

function addDuplicateFindings(entries: AuditEntry[]): void {
  const owners = new Map<string, AuditEntry[]>();
  for (const entry of entries) {
    const key = normalizedBody(entry.explanation);
    if (!key) continue;
    owners.set(key, [...(owners.get(key) ?? []), entry]);
  }
  for (const group of owners.values()) {
    if (group.length < 2) continue;
    const ids = group.map((entry) => entry.id);
    for (const entry of group) {
      entry.deterministicIssues.push({
        code: "duplicate-body",
        detail: `異なる問題と同一本文: ${ids.filter((id) => id !== entry.id).join(", ")}`,
      });
    }
  }
}

function entryHash(entry: AuditEntry): string {
  return sha256(
    JSON.stringify({
      id: entry.id,
      cohort: entry.cohort,
      scenarioContext: entry.scenarioContext,
      problem: entry.problem,
      options: entry.options,
      correctLabels: entry.correctLabels,
      correctOptions: entry.correctOptions,
      explanation: entry.explanation,
      reviewVersion: REVIEW_VERSION,
    }),
  );
}

function loadManualAdjudications(entries: AuditEntry[]): Map<string, ManualAdjudication> {
  if (!fs.existsSync(ADJUDICATIONS)) return new Map();
  const file = JSON.parse(fs.readFileSync(ADJUDICATIONS, "utf8")) as ManualAdjudicationFile;
  if (!file.reviewedAt || !file.method || !Array.isArray(file.items)) {
    throw new Error("Manual explanation adjudications are missing review metadata");
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const output = new Map<string, ManualAdjudication>();
  for (const item of file.items) {
    if (output.has(item.id)) throw new Error(`${item.id}: duplicate manual adjudication`);
    const entry = entryById.get(item.id);
    if (!entry) throw new Error(`${item.id}: manual adjudication has no live question`);
    if (item.status !== "pass") throw new Error(`${item.id}: unsupported adjudication status`);
    if (!item.reason.trim() || !item.evidence.trim()) {
      throw new Error(`${item.id}: manual adjudication is missing its rationale`);
    }
    const currentInputSha256 = entryHash(entry);
    if (item.inputSha256 !== currentInputSha256) {
      throw new Error(`${item.id}: manual adjudication input has changed`);
    }
    if (item.sourceImage) {
      const imagePath = path.join(ROOT, item.sourceImage.path);
      if (!fs.existsSync(imagePath)) throw new Error(`${item.id}: source image is missing`);
      const imageSha256 = fileSha256(imagePath);
      if (imageSha256 !== item.sourceImage.sha256) {
        throw new Error(`${item.id}: source image hash has changed`);
      }
    }
    if (item.sourceAudit) {
      const auditPath = path.join(ROOT, item.sourceAudit.path);
      if (!fs.existsSync(auditPath)) throw new Error(`${item.id}: source audit is missing`);
      if (!fs.readFileSync(auditPath, "utf8").includes(item.sourceAudit.contentSha256)) {
        throw new Error(`${item.id}: source audit evidence has changed`);
      }
    }
    if (!item.sourceImage && !item.sourceAudit) {
      throw new Error(`${item.id}: manual adjudication has no immutable source evidence`);
    }
    output.set(item.id, item);
  }
  return output;
}

function buildBatches(entries: AuditEntry[]): AuditEntry[][] {
  const batches: AuditEntry[][] = [];
  const oneShots = entries.filter((entry) => !entry.scenarioId);
  for (let index = 0; index < oneShots.length; index += ONESHOT_BATCH_SIZE) {
    batches.push(oneShots.slice(index, index + ONESHOT_BATCH_SIZE));
  }
  const scenarioIds = [
    ...new Set(entries.map((entry) => entry.scenarioId).filter(Boolean)),
  ] as string[];
  for (const scenarioId of scenarioIds) {
    batches.push(entries.filter((entry) => entry.scenarioId === scenarioId));
  }
  return batches;
}

function parseResponse(value: string): ReviewResult[] {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized) as
    | ReviewResult[]
    | ReviewResult
    | { items?: ReviewResult[] };
  if (Array.isArray(parsed)) return parsed;
  if ("items" in parsed) return parsed.items ?? [];
  return [parsed as ReviewResult];
}

function validateResults(expected: AuditEntry[], actual: ReviewResult[]): void {
  if (actual.length !== expected.length) {
    throw new Error(`Reviewer returned ${actual.length}; expected ${expected.length}`);
  }
  const byId = new Map(actual.map((item) => [item.id, item]));
  if (byId.size !== actual.length) throw new Error("Reviewer returned duplicate IDs");
  const dimensions: (keyof Pick<
    ReviewResult,
    "correctness" | "specificity" | "remediation" | "completeness" | "clarity"
  >)[] = ["correctness", "specificity", "remediation", "completeness", "clarity"];
  for (const entry of expected) {
    const item = byId.get(entry.id);
    if (!item) throw new Error(`Reviewer omitted ${entry.id}`);
    if (!(["pass", "issue", "uncertain"] as string[]).includes(item.status)) {
      throw new Error(`${entry.id}: invalid status ${JSON.stringify(item.status)}`);
    }
    for (const dimension of dimensions) {
      if (!(["pass", "fail", "uncertain"] as string[]).includes(item[dimension])) {
        throw new Error(`${entry.id}: invalid ${dimension}`);
      }
    }
    if (!Array.isArray(item.issues)) throw new Error(`${entry.id}: issues must be an array`);
    if (item.status === "pass" && item.issues.length > 0) {
      throw new Error(`${entry.id}: pass result contains issues`);
    }
    if (item.status !== "pass" && item.issues.length === 0) {
      throw new Error(`${entry.id}: ${item.status} result has no issue`);
    }
    if (typeof item.evidence !== "string" || typeof item.suggestedFix !== "string") {
      throw new Error(`${entry.id}: evidence or suggestedFix is missing`);
    }
  }
}

async function reviewBatch(entries: AuditEntry[]): Promise<ReviewResult[]> {
  const scenarioContext = entries[0]?.scenarioId ? entries[0].scenarioContext : undefined;
  if (scenarioContext && entries.some((entry) => entry.scenarioId !== entries[0].scenarioId)) {
    throw new Error("A review batch mixes PM scenarios");
  }
  const instructions = `あなたは情報セキュリティマネジメント試験の解説を校閲する責任者です。公式正答、問題文、選択肢、シナリオと現行解説を突き合わせ、受験者が誤りを直せる品質か判定してください。

判定基準:
- 公式正答記号とcorrectOptionsは確定値である。別の正答へ読み替えない。
- correctness: 正答理由と記載事実に矛盾や取り違えがない。
- specificity: 問題固有の語句、条件、計算又は因果関係を使って決め手を示す。
- remediation: 一問一答では、正しい概念の定義・成立条件・計算過程のいずれかによって、主要な誤答を排除できればpassにする。誤答の記号や全文を明示する必要はない。午後問題では誤答列挙より、本文・空欄・人物・操作・条件の対応を優先する。
- completeness: 複数正答、複数空欄、組合せは全要素を扱う。
- clarity: 正答の復唱、一般論、別問題の使い回しで終わらず、短くても読めば判断規則が分かる。
- 問題や図から確認できない周辺知識を要求しない。図表の内容を確認できず、現行解説の正否を判定できない場合はuncertainにする。
- qualitySignalsは再確認を促すheuristicであり、それ自体をissueの根拠にしない。
- 全誤答の列挙を要求しない。「他の選択肢を説明していない」だけではissueにせず、欠けている決め手又は条件を具体的に特定できる場合だけissueにする。
- completenessは正答を構成する要素の完全性であり、誤答全件の説明数ではない。
- 軽い表記揺れや文体の好みだけではissueにしない。
- issueとuncertainのissues、evidence、suggestedFixは、原問に照らして直せる具体的な日本語にする。
- passではissuesを空配列、suggestedFixを空文字にする。
- 指定JSON以外を返さない。

出力:
{"items":[{"id":"...","status":"pass|issue|uncertain","correctness":"pass|fail|uncertain","specificity":"pass|fail|uncertain","remediation":"pass|fail|uncertain","completeness":"pass|fail|uncertain","clarity":"pass|fail|uncertain","issues":["..."],"evidence":"判定根拠","suggestedFix":"修正方針"}]}`;
  const payload = {
    ...(scenarioContext ? { scenarioContext } : {}),
    items: entries.map((entry) => ({
      id: entry.id,
      cohort: entry.cohort,
      problem: entry.problem,
      options: entry.options,
      correctLabels: entry.correctLabels,
      correctOptions: entry.correctOptions,
      explanation: entry.explanation,
    })),
  };
  let previousError = "";
  let rawResponse = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({
          model: MODEL,
          prompt: `${instructions}\n\n監査対象:\n${JSON.stringify(payload)}${
            previousError ? `\n\n前回の形式違反: ${previousError}` : ""
          }`,
          stream: false,
          think: false,
          keep_alive: "30m",
          options: {
            temperature: 0.05,
            num_ctx: 32768,
            num_predict: Math.max(2400, entries.length * 620),
          },
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const responsePayload = (await response.json()) as {
        response?: string;
        error?: string;
      };
      if (responsePayload.error) throw new Error(responsePayload.error);
      rawResponse = responsePayload.response ?? "";
      const items = parseResponse(rawResponse);
      validateResults(entries, items);
      return items;
    } catch (error) {
      previousError = error instanceof Error ? error.message : String(error);
      console.warn(
        `Retry ${attempt}/4: ${previousError}; raw=${JSON.stringify(rawResponse.slice(0, 1000))}`,
      );
    }
  }
  throw new Error(previousError || "Reviewer failed without an error message");
}

function finalStatus(
  entry: AuditEntry,
  review: AuditedReviewResult,
  adjudications: Map<string, ManualAdjudication>,
): ReviewStatus {
  if (entry.deterministicIssues.length > 0) return "issue";
  const adjudication = adjudications.get(entry.id);
  if (adjudication?.inputSha256 === review.inputSha256) return adjudication.status;
  return review.status;
}

function updateSummary(
  audit: AuditFile,
  entries: AuditEntry[],
  adjudications: Map<string, ManualAdjudication>,
): void {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const statuses = audit.items.map((review) => ({
    id: review.id,
    status: finalStatus(entryById.get(review.id)!, review, adjudications),
  }));
  const issueIds = statuses.filter((item) => item.status === "issue").map((item) => item.id);
  const uncertainIds = statuses
    .filter((item) => item.status === "uncertain")
    .map((item) => item.id);
  audit.summary = {
    reviewedCount: audit.items.length,
    passCount: statuses.filter((item) => item.status === "pass").length,
    issueCount: issueIds.length,
    uncertainCount: uncertainIds.length,
    unreviewedCount: entries.length - audit.items.length,
    issueIds,
    uncertainIds,
  };
}

function writeAudit(
  audit: AuditFile,
  entries: AuditEntry[],
  adjudications: Map<string, ManualAdjudication>,
): void {
  audit.generatedAt = new Date().toISOString();
  audit.manualAdjudicationCount = adjudications.size;
  audit.manualAdjudications = [...adjudications.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  audit.items.sort((left, right) => left.id.localeCompare(right.id));
  updateSummary(audit, entries, adjudications);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  if (!Number.isInteger(ONESHOT_BATCH_SIZE) || ONESHOT_BATCH_SIZE < 1 || ONESHOT_BATCH_SIZE > 12) {
    throw new Error(`Invalid SG_EXPLANATION_REVIEW_BATCH_SIZE: ${ONESHOT_BATCH_SIZE}`);
  }
  if (!(LIMIT > 0)) throw new Error(`Invalid --limit value: ${LIMIT}`);
  const { entries } = loadQuestions();
  const adjudications = loadManualAdjudications(entries);
  const inputHash = sha256(entries.map(entryHash).join("\n"));
  const deterministicIssueCount = entries.reduce(
    (count, entry) => count + entry.deterministicIssues.length,
    0,
  );
  let audit: AuditFile = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    reviewVersion: REVIEW_VERSION,
    explanationInputSha256: inputHash,
    expectedReviewCount: entries.length,
    deterministicReviewCount: entries.length,
    deterministicIssueCount,
    manualAdjudicationCount: adjudications.size,
    manualAdjudications: [...adjudications.values()],
    deterministicFindings: entries
      .filter(
        (entry) =>
          entry.deterministicIssues.length > 0 || entry.qualitySignals.length > 0,
      )
      .map((entry) => ({
        id: entry.id,
        issues: entry.deterministicIssues,
        qualitySignals: entry.qualitySignals,
      })),
    items: [],
    summary: {
      reviewedCount: 0,
      passCount: 0,
      issueCount: 0,
      uncertainCount: 0,
      unreviewedCount: entries.length,
      issueIds: [],
      uncertainIds: [],
    },
  };
  if (!RESTART && fs.existsSync(OUTPUT)) {
    audit = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as AuditFile;
    if (audit.model !== MODEL || audit.reviewVersion !== REVIEW_VERSION) {
      throw new Error("Existing audit uses a different reviewer or version; use --restart");
    }
    const currentHashes = new Map(entries.map((entry) => [entry.id, entryHash(entry)]));
    audit.items = audit.items.filter(
      (item) => currentHashes.get(item.id) === item.inputSha256,
    );
    audit.explanationInputSha256 = inputHash;
    audit.expectedReviewCount = entries.length;
    audit.deterministicReviewCount = entries.length;
    audit.deterministicIssueCount = deterministicIssueCount;
    audit.deterministicFindings = entries
      .filter(
        (entry) =>
          entry.deterministicIssues.length > 0 || entry.qualitySignals.length > 0,
      )
      .map((entry) => ({
        id: entry.id,
        issues: entry.deterministicIssues,
        qualitySignals: entry.qualitySignals,
      }));
  }
  const reviewedIds = new Set(audit.items.map((item) => item.id));
  const pending = entries.filter((entry) => !reviewedIds.has(entry.id));
  if (CHECK_ONLY) {
    audit.manualAdjudicationCount = adjudications.size;
    audit.manualAdjudications = [...adjudications.values()];
    updateSummary(audit, entries, adjudications);
    console.log(JSON.stringify(audit.summary, null, 2));
    if (
      pending.length > 0 ||
      audit.summary.issueCount > 0 ||
      audit.summary.uncertainCount > 0
    ) {
      throw new Error(
        `Explanation audit is not complete: ${pending.length} pending, ${audit.summary.issueCount} issues, ${audit.summary.uncertainCount} uncertain`,
      );
    }
    return;
  }
  const selected = pending.slice(0, LIMIT);
  const selectedIds = new Set(selected.map((entry) => entry.id));
  const batches = buildBatches(entries)
    .map((batch) => batch.filter((entry) => selectedIds.has(entry.id)))
    .filter((batch) => batch.length > 0);
  console.log(
    `Explanation review ${entries.length - pending.length}/${entries.length}; selected ${selected.length}; model ${MODEL}`,
  );
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const results = await reviewBatch(batch);
    audit.items.push(
      ...results.map((item) => {
        const entry = batch.find((candidate) => candidate.id === item.id);
        if (!entry) throw new Error(`${item.id}: reviewed input is missing`);
        return { ...item, inputSha256: entryHash(entry) };
      }),
    );
    writeAudit(audit, entries, adjudications);
    console.log(
      `Reviewed batch ${index + 1}/${batches.length}: ${batch.map((entry) => entry.id).join(", ")}`,
    );
  }
  writeAudit(audit, entries, adjudications);
  console.log(JSON.stringify(audit.summary, null, 2));
  if (audit.summary.unreviewedCount === 0 && (audit.summary.issueCount > 0 || audit.summary.uncertainCount > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
