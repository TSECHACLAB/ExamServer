import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { JSDOM } from "jsdom";
import { compactJapaneseText } from "./lib/dom-to-markdown";
import {
  groupPmScenarios,
  type PmPlayableQuestion,
  type PmScenario,
} from "./lib/sg-pm-question-groups";

interface ExplanationItem {
  id: string;
  explanation: string;
}

interface ReviewEntry {
  id: string;
  problem: string;
  options: string[];
  answerLabel: string;
  correctOptions: string[];
  explanation: string;
  sourceEvidence: string;
  scenarioContext: string;
  figureBased: boolean;
  groupedAnswerCount: number;
  reviewClarification?: string;
}

interface ReviewResult {
  id: string;
  status: "pass" | "issue";
  coveredFacts: string[];
  issues: string[];
}

interface AuditedReviewResult extends ReviewResult {
  inputSha256: string;
}

interface AuditFile {
  generatedAt: string;
  model: string;
  reviewVersion: number;
  explanationInputSha256: string;
  expectedReviewCount: number;
  factCheckNoteCorrectionIds: string[];
  reviewClarificationIds: string[];
  items: AuditedReviewResult[];
}

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DIR = path.join(ROOT, "artifacts", "question-content");
const PM_AUDIT = path.join(CONTENT_DIR, "legacy-sg-pm-audit.json");
const GENERATED = path.join(CONTENT_DIR, "legacy-sg-pm-explanations.json");
const MANUAL = path.join(CONTENT_DIR, "legacy-sg-pm-manual-explanations.json");
const CORRECTIONS = path.join(
  CONTENT_DIR,
  "legacy-sg-pm-explanation-corrections.json",
);
const OUTPUT = path.join(
  CONTENT_DIR,
  "legacy-sg-pm-explanation-coverage-audit.json",
);
const MODEL = process.env.SG_PM_REVIEW_MODEL ?? "gpt-oss:20b";
const SUPPORTS_JSON_SCHEMA = !MODEL.startsWith("gpt-oss:");
const REVIEW_VERSION = 2;
const BATCH_SIZE = Number(process.env.SG_PM_REVIEW_BATCH_SIZE ?? 2);
const RESTART = process.argv.includes("--restart");
const LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const HIGH_RISK_PATTERN = /組合せ|全て挙げ|二つ|三つ/;
const FACT_CHECK_NOTE_CORRECTIONS: Record<
  string,
  { from: string; to: string; reason: string }
> = {
  "sg-2016-autumn-pm-q03-u03": {
    from: "正しい組合せは「(ⅱ)，(ⅳ)」なので「カ」が正解です。",
    to: "正しい組合せは「(ⅱ)，(ⅴ)」なので「カ」が正解です。",
    reason:
      "補助解説の末尾だけが選択肢カの内容と矛盾する。公式正答カと同じページ内の個別判定は(ⅱ),(ⅴ)。",
  },
  "sg-2017-autumn-pm-q01-u07": {
    from: "∴e＝イ　e1＝ハードディスクドライブ全体の暗号化　e2＝物理的対策",
    to: "∴e＝オ　e1＝ハードディスクドライブ全体の暗号化　e2＝物理的対策",
    reason:
      "補助解説の結論だけが公式正答オと矛盾する。e1,e2の説明内容は選択肢オと一致する。",
  },
};
const REVIEW_CLARIFICATIONS: Record<string, string> = {
  "sg-2017-autumn-pm-q01-u05":
    "図1のしきい値は5で、リスク値は重要度×脅威評価値×脆弱性評価値。重要度2・脅威1・脆弱性2は4なので、一部の管理策でも受容可能であり、(ⅲ)は不適切。公式正答オ=options[4]は(ⅱ)だけ。",
  "sg-2017-autumn-pm-q02-u04":
    "空欄a1,a2は攻撃名ではなく表1の分類欄である。SQLインジェクションとXSSは分類対象で、公式正答ウ=options[2]はa1=能動的、a2=受動的。",
  "sg-2017-spring-pm-q01-u02":
    "設問の(ⅴ)はoptions[4]ではなくproblem中の5番目の記述で、端末ロック又はファイル暗号化による可用性喪失を指す。(ⅳ)がデータ収集・外部送信。公式正答コ=options[9]は(ⅴ),(ⅶ)。",
  "sg-2018-autumn-pm-q01-u04":
    "公式正答ウの解答群画像ではb1=(ⅰ), b2=(ⅵ), b3=(ⅳ)。b3はフィッシングによる認証情報窃取(ⅲ)ではなく、経理担当者自身のIDによる不正な振込承認(ⅳ)。",
  "sg-2019-spring-pm-q02-u09":
    "公式正答イの解答群画像はd1=(ⅰ), d2=(ⅱ), d3=(ⅳ)。業務用PCでSNSを個人利用しないこと(ⅱ)は正答要素であり、解説はこれを誤りとは記載していない。",
};
const pageCache = new Map<string, Promise<Document>>();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function loadItems(filePath: string): ExplanationItem[] {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    items?: ExplanationItem[];
  };
  return parsed.items ?? [];
}

function loadExplanationMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of [...loadItems(GENERATED), ...loadItems(MANUAL)]) {
    if (map.has(item.id)) throw new Error(`${item.id}: explanations overlap`);
    map.set(item.id, item.explanation);
  }
  for (const item of loadItems(CORRECTIONS)) {
    if (!map.has(item.id)) throw new Error(`${item.id}: correction target is missing`);
    map.set(item.id, item.explanation);
  }
  return map;
}

async function fetchDocument(url: string): Promise<Document> {
  const cached = pageCache.get(url);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(url, {
      headers: { "user-agent": "ExamServer explanation coverage audit/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return new JSDOM(await response.text(), { url }).window.document;
  })();
  pageCache.set(url, pending);
  return pending;
}

async function fetchFactCheckNotes(question: PmPlayableQuestion): Promise<string> {
  if (!question.audit.factCheckAvailable) return "";
  const document = await fetchDocument(question.audit.transcriptionUrl);
  const select = document.querySelector(
    `select[name="sel_${question.audit.answerSlot}"]`,
  );
  let current = select?.closest("div.inputAnswerBox")?.nextElementSibling ?? null;
  while (current && !current.matches("div.inputAnswerBox")) {
    if (current.matches("div.kaisetsu")) {
      const notes = compactJapaneseText(current.textContent ?? "");
      if (!notes || notes.includes("解説はまだありません")) break;
      if (
        question.audit.factCheckNotesSha256 &&
        sha256(notes) !== question.audit.factCheckNotesSha256
      ) {
        throw new Error(`${question.id}: fact-check notes changed after import audit`);
      }
      const correction = FACT_CHECK_NOTE_CORRECTIONS[question.id];
      if (correction) {
        if (!notes.includes(correction.from)) {
          throw new Error(`${question.id}: fact-check correction target is missing`);
        }
        return notes.replace(correction.from, correction.to).slice(0, 3600);
      }
      return notes.slice(0, 3600);
    }
    current = current.nextElementSibling;
  }
  throw new Error(`${question.id}: expected fact-check notes are missing`);
}

function loadScenarios(): PmScenario<PmPlayableQuestion>[] {
  const parsed = JSON.parse(fs.readFileSync(PM_AUDIT, "utf8")) as {
    scenarios: PmScenario[];
  };
  return groupPmScenarios(parsed.scenarios);
}

async function buildEntries(): Promise<ReviewEntry[]> {
  const explanations = loadExplanationMap();
  const entries: ReviewEntry[] = [];
  for (const scenario of loadScenarios()) {
    for (const question of scenario.questions) {
      if (
        !question.audit.requiresOfficialFigure &&
        !HIGH_RISK_PATTERN.test(question.text) &&
        question.audit.groupedUnitIds.length === 1
      ) {
        continue;
      }
      const explanation = explanations.get(question.id);
      if (!explanation) throw new Error(`${question.id}: explanation is missing`);
      const answerIndexes = Array.isArray(question.answer)
        ? question.answer
        : [question.answer];
      entries.push({
        id: question.id,
        problem: question.text,
        options: question.options,
        answerLabel: answerIndexes.map((index) => LABELS[index]).join("・"),
        correctOptions: answerIndexes.map((index) => question.options[index]),
        explanation,
        sourceEvidence: await fetchFactCheckNotes(question),
        scenarioContext: question.audit.factCheckAvailable
          ? ""
          : scenario.scenario.slice(0, 6000),
        figureBased: question.audit.requiresOfficialFigure,
        groupedAnswerCount: question.audit.groupedUnitIds.length,
        ...(REVIEW_CLARIFICATIONS[question.id]
          ? { reviewClarification: REVIEW_CLARIFICATIONS[question.id] }
          : {}),
      });
    }
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

function validateResults(expected: ReviewEntry[], actual: ReviewResult[]): void {
  if (actual.length !== expected.length) {
    throw new Error(`Reviewer returned ${actual.length}; expected ${expected.length}`);
  }
  const byId = new Map(actual.map((item) => [item.id, item]));
  if (byId.size !== actual.length) throw new Error("Reviewer returned duplicate IDs");
  for (const entry of expected) {
    const result = byId.get(entry.id);
    if (!result) throw new Error(`Reviewer omitted ${entry.id}`);
    if (result.status !== "pass" && result.status !== "issue") {
      throw new Error(
        `${entry.id}: invalid review status ${JSON.stringify(result.status)}`,
      );
    }
    if (!Array.isArray(result.coveredFacts) || result.coveredFacts.length === 0) {
      throw new Error(`${entry.id}: coveredFacts are missing`);
    }
    if (!Array.isArray(result.issues)) {
      throw new Error(`${entry.id}: issues must be an array`);
    }
    if (result.status === "pass" && result.issues.length > 0) {
      throw new Error(`${entry.id}: pass result contains issues`);
    }
    if (result.status === "issue" && result.issues.length === 0) {
      throw new Error(`${entry.id}: issue result has no explanation`);
    }
  }
}

function parseReviewResponse(value: string): ReviewResult[] {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  type RawReviewResult = Omit<ReviewResult, "status"> & {
    status?: ReviewResult["status"];
  };
  const parsed = JSON.parse(normalized) as
    | RawReviewResult
    | RawReviewResult[]
    | { items?: RawReviewResult[] };
  let rawItems: RawReviewResult[];
  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if ("items" in parsed) {
    rawItems = (parsed as { items?: RawReviewResult[] }).items ?? [];
  } else {
    rawItems = [parsed as RawReviewResult];
  }
  return rawItems.map((item) => ({
    ...item,
    status:
      item.status ??
      (Array.isArray(item.issues) && item.issues.length > 0 ? "issue" : "pass"),
  }));
}

async function reviewBatch(entries: ReviewEntry[]): Promise<ReviewResult[]> {
  const instructions = `あなたは情報セキュリティマネジメント試験の校閲者です。各解説を、設問、正答記号、出典照合メモと突き合わせて監査してください。

判定基準:
- passは、正答を構成する全ての要素、空欄、人物、操作、条件を解説が扱い、因果関係が正しい場合だけにする。
- answerLabelとcorrectOptionsは公式正答から機械的に確定した値である。正答の判定ではこの二つを優先し、別の選択肢へ読み替えない。
- 正しい要素が一つでも欠落、逆転、別設問との混同、根拠のない追加、誤答の正当化があればissueにする。
- 文体の好み、表記揺れ、情報量の多さだけではissueにしない。
- 出典照合メモは検証用であり、その出典名やサイト名は論点にしない。
- coveredFactsには、解説が扱うべき正答要素を短い日本語で全て列挙する。
- issuesには不足又は誤りを、修正可能な具体性で書く。問題がなければ空配列にする。
- 指定したJSON以外を返さない。`;
  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: { type: "string", enum: ["pass", "issue"] },
            coveredFacts: { type: "array", items: { type: "string" } },
            issues: { type: "array", items: { type: "string" } },
          },
          required: ["id", "status", "coveredFacts", "issues"],
        },
      },
    },
    required: ["items"],
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
          prompt: `${instructions}\n\n監査対象:\n${JSON.stringify(entries)}${
            previousError ? `\n\n前回の形式違反: ${previousError}` : ""
          }`,
          stream: false,
          think: false,
          keep_alive: "30m",
          ...(SUPPORTS_JSON_SCHEMA ? { format: schema } : {}),
          options: {
            temperature: 0.05,
            num_ctx: 16384,
            num_predict: SUPPORTS_JSON_SCHEMA ? 1400 : 4000,
          },
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = (await response.json()) as { response?: string };
      rawResponse = payload.response ?? "";
      const items = parseReviewResponse(rawResponse);
      validateResults(entries, items);
      return items;
    } catch (error) {
      previousError = error instanceof Error ? error.message : String(error);
      console.warn(
        `Retry ${attempt}/4: ${previousError}; raw=${JSON.stringify(rawResponse.slice(0, 1200))}`,
      );
    }
  }
  throw new Error(previousError || "Reviewer failed without an error message");
}

function writeAudit(audit: AuditFile): void {
  audit.generatedAt = new Date().toISOString();
  audit.items.sort((left, right) => left.id.localeCompare(right.id));
  fs.writeFileSync(OUTPUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 4) {
    throw new Error(`Invalid SG_PM_REVIEW_BATCH_SIZE: ${BATCH_SIZE}`);
  }
  const entries = await buildEntries();
  if (entries.length !== 96) {
    throw new Error(`Expected 96 high-risk PM questions, found ${entries.length}`);
  }
  const inputHash = sha256(JSON.stringify(entries));
  let audit: AuditFile = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    reviewVersion: REVIEW_VERSION,
    explanationInputSha256: inputHash,
    expectedReviewCount: entries.length,
    factCheckNoteCorrectionIds: Object.keys(FACT_CHECK_NOTE_CORRECTIONS),
    reviewClarificationIds: Object.keys(REVIEW_CLARIFICATIONS),
    items: [],
  };
  if (!RESTART && fs.existsSync(OUTPUT)) {
    audit = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as AuditFile;
    if (
      audit.model !== MODEL ||
      audit.reviewVersion !== REVIEW_VERSION
    ) {
      throw new Error("Existing coverage audit uses a different reviewer; use --restart");
    }
    const currentInputById = new Map(
      entries.map((entry) => [entry.id, sha256(JSON.stringify(entry))]),
    );
    audit.items = audit.items.filter(
      (item) => currentInputById.get(item.id) === item.inputSha256,
    );
    audit.explanationInputSha256 = inputHash;
    audit.expectedReviewCount = entries.length;
    audit.factCheckNoteCorrectionIds = Object.keys(FACT_CHECK_NOTE_CORRECTIONS);
    audit.reviewClarificationIds = Object.keys(REVIEW_CLARIFICATIONS);
  }
  const reviewed = new Set(audit.items.map((item) => item.id));
  const pending = entries.filter((entry) => !reviewed.has(entry.id));
  console.log(
    `Coverage review ${entries.length - pending.length}/${entries.length}; model ${MODEL}`,
  );
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    audit.items.push(
      ...(await reviewBatch(batch)).map((item) => {
        const entry = batch.find((candidate) => candidate.id === item.id);
        if (!entry) throw new Error(`${item.id}: reviewed input is missing`);
        return { ...item, inputSha256: sha256(JSON.stringify(entry)) };
      }),
    );
    writeAudit(audit);
    console.log(`Reviewed ${Math.min(index + batch.length, pending.length)}/${pending.length}`);
  }
  const issues = audit.items.filter((item) => item.status === "issue");
  console.log(
    JSON.stringify(
      {
        reviewCount: audit.items.length,
        passCount: audit.items.length - issues.length,
        issueCount: issues.length,
        issueIds: issues.map((item) => item.id),
      },
      null,
      2,
    ),
  );
  if (issues.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
