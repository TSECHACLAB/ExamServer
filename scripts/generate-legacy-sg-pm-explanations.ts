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

interface Candidate {
  question: PmPlayableQuestion;
  scenario: PmScenario<PmPlayableQuestion>;
}

interface GenerationEntry {
  id: string;
  problem: string;
  options: string[];
  correct: string;
  answerLabel: string;
  context: string;
  sourceEvidence: string;
  figureBased: boolean;
}

interface GeneratedItem {
  id: string;
  explanation: string;
}

interface ModelGeneratedItem {
  id: string;
  explanation: string;
}

interface OutputFile {
  generatedAt: string;
  model: string;
  promptVersion: number;
  items: GeneratedItem[];
}

const ROOT = path.resolve(import.meta.dirname, "..");
const INPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-audit.json",
);
const OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-explanations.json",
);
const QUALITY_AUDIT_OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-explanation-quality-audit.json",
);
const EXPLANATION_CORRECTIONS = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-pm-explanation-corrections.json",
);
const MODEL = process.env.SG_EXPLANATION_MODEL ?? "huihui-qwen-thinking:latest";
const PROMPT_VERSION = 14;
const BATCH_SIZE = Number(process.env.SG_PM_EXPLANATION_BATCH_SIZE ?? 3);
const MAX_GENERATION_ATTEMPTS = 5;
const LIMIT_ARGUMENT = process.argv.find((argument) => argument.startsWith("--limit="));
const LIMIT = LIMIT_ARGUMENT ? Number(LIMIT_ARGUMENT.split("=")[1]) : Number.POSITIVE_INFINITY;
const AUDIT_EXISTING = process.argv.includes("--audit-existing");
const LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const FIGURE_ACTION_TERMS = [
  "検知",
  "検出",
  "報告",
  "通知",
  "調査",
  "復旧",
  "復元",
  "遮断",
  "切り離",
  "削除",
  "暗号化",
  "認証",
  "教育",
  "監視",
  "隔離",
  "公表",
  "閉鎖",
  "廃棄",
  "承認",
  "許可",
];
const pageCache = new Map<string, Promise<Document>>();

function normalizeWhitespace(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(/\s+/g, " ").trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchDocument(url: string): Promise<Document> {
  const cached = pageCache.get(url);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(url, {
      headers: { "user-agent": "ExamServer explanation fact-check/1.0" },
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
  const box = select?.closest("div.inputAnswerBox");
  let current = box?.nextElementSibling ?? null;
  let notes = "";
  while (current && !current.matches("div.inputAnswerBox")) {
    if (current.matches("div.kaisetsu")) {
      // The audit hashes this exact normalized DOM text.  Reuse the same
      // normalizer so line breaks in table-based explanations do not look
      // like a source change during generation.
      notes = compactJapaneseText(current.textContent ?? "");
      break;
    }
    current = current.nextElementSibling;
  }
  if (!notes || notes.includes("解説はまだありません")) {
    throw new Error(`${question.id}: expected fact-check notes are missing`);
  }
  if (
    question.audit.factCheckNotesSha256 &&
    sha256(notes) !== question.audit.factCheckNotesSha256
  ) {
    throw new Error(`${question.id}: fact-check notes changed after the content audit`);
  }
  return notes.slice(0, 2400);
}

function withoutFigureMarkers(value: string): string {
  return value.replace(/\[\[OFFICIAL_FIGURE:[^\]]+\]\]/g, " [図表] ");
}

function fullScenarioContext(scenario: string): string {
  return scenario.replace(
    /\[\[OFFICIAL_FIGURE:([^\]]+)\]\]/g,
    (_marker, id: string) => `【公式図表 ${id}】`,
  );
}

function readExisting(): OutputFile {
  if (!fs.existsSync(OUTPUT)) {
    return {
      generatedAt: new Date().toISOString(),
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      items: [],
    };
  }
  const existing = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as OutputFile;
  if (existing.model !== MODEL) {
    throw new Error(`Existing explanation model is ${existing.model}; requested ${MODEL}`);
  }
  if (existing.promptVersion !== PROMPT_VERSION) {
    throw new Error(
      `Existing explanation prompt is v${existing.promptVersion ?? "unknown"}; requested v${PROMPT_VERSION}`,
    );
  }
  return existing;
}

function writeOutput(output: OutputFile): void {
  output.generatedAt = new Date().toISOString();
  output.items.sort((left, right) => left.id.localeCompare(right.id));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

function hasCopiedSentence(explanation: string, notes: string): boolean {
  const normalizeForComparison = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】]/g, "");
  const normalizedNotes = normalizeForComparison(notes);
  if (!normalizedNotes) return false;
  const normalizedExplanation = normalizeForComparison(
    explanation.replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*\*\*\s*/,
      "",
    ),
  );
  const windowLength = 36;
  for (let index = 0; index <= normalizedExplanation.length - windowLength; index += 1) {
    if (normalizedNotes.includes(normalizedExplanation.slice(index, index + windowLength))) {
      return true;
    }
  }
  return false;
}

function hasRepeatedSentence(explanation: string): boolean {
  const sentences = explanation
    .replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*\*\*\s*/,
      "",
    )
    .split(/[。！？\n]/)
    .map(normalizeWhitespace)
    .filter((sentence) => sentence.length >= 16);
  return new Set(sentences).size !== sentences.length;
}

function normalizeForOverlap(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】*]/g, "");
}

function hasRepeatedLongPhrase(value: string, windowLength = 18): boolean {
  const normalized = normalizeForOverlap(value);
  for (let index = 0; index <= normalized.length - windowLength; index += 1) {
    const phrase = normalized.slice(index, index + windowLength);
    if (normalized.indexOf(phrase, index + windowLength) >= 0) return true;
  }
  return false;
}

function normalizeEditorialPhrasing(value: string): string {
  return value
    .split(/(?<=[。！？])/u)
    .filter(
      (sentence) =>
        !/(?:他の|それ以外の)(?:選択肢|グループ|案|項目)/.test(sentence),
    )
    .join("")
    .replace(/上記の情報|与えられた情報/g, "本文の記述")
    .replace(/sourceEvidence(?:では|によると|によれば|には|にも|より|から|の)?[、，]?\s*/gi, "")
    .replace(/(^|[。！？])\s*より[、，]\s*/g, "$1")
    .replace(
      /正解は[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*です。?\s*/g,
      "",
    );
}

function validateBatch(
  expected: {
    id: string;
    answerLabel: string;
    notes: string;
    problem: string;
    figureBased: boolean;
    humanReviewed?: boolean;
  }[],
  actual: GeneratedItem[],
): void {
  if (actual.length !== expected.length) {
    throw new Error(`Model returned ${actual.length} items; expected ${expected.length}`);
  }
  const actualById = new Map(actual.map((item) => [item.id, item]));
  if (actualById.size !== actual.length) throw new Error("Model returned duplicate IDs");
  for (const expectation of expected) {
    const item = actualById.get(expectation.id);
    if (!item) throw new Error(`Model omitted ${expectation.id}`);
    const body = normalizeEditorialPhrasing(item.explanation)
      .trim()
      .replace(
        /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*\*\*\s*/,
        "",
      )
      .replace(
        /^正解は[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*です。?\s*/,
        "",
      );
    const explanation = `**正解：${expectation.answerLabel}**\n\n${body}`;
    if (explanation.length < 80 || explanation.length > 700) {
      throw new Error(`${expectation.id}: explanation length is ${explanation.length}`);
    }
    const internalAid = explanation.match(/sg-siken|過去問道場|確認メモ|参照メモ/)?.[0];
    if (internalAid) {
      throw new Error(
        `${expectation.id}: explanation exposes an internal aid (${internalAid})`,
      );
    }
    if (hasCopiedSentence(explanation, expectation.notes)) {
      throw new Error(`${expectation.id}: explanation contains a copied sentence`);
    }
    if (hasRepeatedSentence(explanation)) {
      throw new Error(`${expectation.id}: explanation repeats a sentence`);
    }
    if (hasRepeatedLongPhrase(body)) {
      throw new Error(`${expectation.id}: explanation repeats a long phrase`);
    }
    if (
      /(?:他の|それ以外の)(?:選択肢|グループ|案|項目).{0,65}(?:関係がない|記載されていない|該当しない|一致しない|形式が異なる|適切でない|不適切|誤りである|合わない)/.test(
        explanation,
      )
    ) {
      throw new Error(`${expectation.id}: explanation dismisses choices generically`);
    }
    if (
      expectation.figureBased &&
      /誤答の例|(?:他の|それ以外の)(?:選択肢|グループ|案|項目)|選択肢[アイウエオカキクケコ]/.test(explanation)
    ) {
      throw new Error(`${expectation.id}: figure explanation invents unseen distractors`);
    }
    if (expectation.figureBased && !expectation.humanReviewed) {
      const unsupportedAction = FIGURE_ACTION_TERMS.find(
        (term) =>
          explanation.includes(term) &&
          !expectation.notes.includes(term) &&
          !expectation.problem.includes(term),
      );
      if (unsupportedAction) {
        throw new Error(
          `${expectation.id}: figure explanation adds unsupported action ${unsupportedAction}`,
        );
      }
    }
    item.explanation = explanation;
  }
}

async function generateBatch(entries: GenerationEntry[]): Promise<GeneratedItem[]> {
  const instructions = `あなたは情報セキュリティマネジメント試験の問題編集者です。長文問題の各解答欄について、受験者が判断根拠を追えるオリジナル解説を一段落で書いてください。

条件:
- explanationには、本文のどの事実から正答へ至るかを一つの因果関係として書く。正答ラベルはコード側で付けるので書かない。
- 正答と結論を言い換えて二度書かず、設問文の要約だけで終わらせない。
- シナリオ全体、正答選択肢、sourceEvidenceを相互に照合し、正しい選択肢に至る論理を具体的に結び付ける。
- sourceEvidenceにはこの設問の判断根拠が含まれている。必ずその論点を使い、別の設問・人物・表・攻撃と取り違えない。
- 「防ぐ」「検知する」「報告する」「調査する」「復旧する」などの行為種別を、別の行為へ言い換えない。目的、対象、時点、因果関係を入力にない内容へ変えない。
- 組合せ問題では、正しい構成要素をそれぞれ示し、両方が設問の条件を満たす共通の判断基準を書く。
- correctに複数の選択肢が「/」区切りで入っている場合は、本来の複数選択1問である。全ての正答を一つの解説で扱い、同じ設問を解答欄ごとに分けない。
- 誤答へ触れる必要はない。比較が判断根拠に不可欠な場合だけ、入力にある誤答を特定して違いを書く。「他の選択肢」のような一括処理はしない。
- figureBasedがtrueの問題では解答群の画像自体は入力に含まれていない。sourceEvidenceに明示された正しい組合せだけを文章で示し、見えていない誤答の番号、名称、組合せを推測しない。
- 90〜220字を目安にする。設問の言い換えだけ、一般的な勉強法、励まし、出典紹介は書かない。
- 同じ文を繰り返さない。段階名、番号、人物、用語は入力と突き合わせ、入力にない対応関係を足さない。
- sourceEvidenceは編集時だけの非表示情報である。24文字以上のまとまりを引用・転載せず、必ず自分の言葉で要約する。その存在、文字列sourceEvidence、入力名、メモ、サイト、生成過程にも触れない。
- 情報がない事項を推測で足さない。回答前に正答、設問が指定する解答欄、sourceEvidenceとの整合を自己点検する。
- 入力JSONはscenarios配列の各contextに、その長文に属するquestionsをまとめている。設問は必ず同じ要素内のcontextだけと照合する。
- 指定されたJSON以外を返さない。`;
  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["id", "explanation"],
        },
      },
    },
    required: ["items"],
  };
  let lastError: unknown;
  let previousError = "";
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const omitEvidence =
        attempt >= 3 && /copied sentence|internal aid/.test(previousError);
      const promptEntries = omitEvidence
        ? entries.map((entry) =>
            entry.figureBased ? entry : { ...entry, sourceEvidence: "" },
          )
        : entries;
      const groupedEntries = new Map<
        string,
        { context: string; questions: Omit<GenerationEntry, "context">[] }
      >();
      for (const entry of promptEntries) {
        const { context, ...question } = entry;
        const group = groupedEntries.get(context) ?? { context, questions: [] };
        group.questions.push(question);
        groupedEntries.set(context, group);
      }
      const retryInstruction = attempt === 1
        ? ""
        : `\n\n前回の違反: ${previousError}\nこの違反を直し、全項目を事実関係から再確認して書き直すこと。`;
      const prompt = `${instructions}\n\n問題:\n${JSON.stringify({ scenarios: [...groupedEntries.values()] })}${retryInstruction}`;
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          stream: false,
          think: false,
          keep_alive: "30m",
          format: schema,
          options: {
            temperature: 0.12 + attempt * 0.05,
            num_ctx: 16384,
            num_predict: Math.max(420, entries.length * 260),
          },
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = (await response.json()) as { response?: string };
      const parsed = JSON.parse(payload.response ?? "") as {
        items?: ModelGeneratedItem[];
      };
      const rawItems = parsed.items ?? [];
      const entryById = new Map(entries.map((entry) => [entry.id, entry]));
      const items = rawItems.map((item): GeneratedItem => {
        const entry = entryById.get(item.id);
        if (!entry) return { id: item.id, explanation: item.explanation };
        const explanation = normalizeEditorialPhrasing(item.explanation).trim();
        if (explanation.length < 70) {
          throw new Error(`${item.id}: explanation is missing or too short`);
        }
        if (explanation.length > 300) {
          throw new Error(`${item.id}: explanation is too long`);
        }
        return {
          id: item.id,
          explanation,
        };
      });
      validateBatch(
        entries.map((entry) => ({
          id: entry.id,
          answerLabel: entry.answerLabel,
          notes: entry.sourceEvidence,
          problem: entry.problem,
          figureBased: entry.figureBased,
        })),
        items,
      );
      return items;
    } catch (error) {
      lastError = error;
      previousError = error instanceof Error ? error.message : String(error);
      console.warn(
        `Retry ${attempt}/${MAX_GENERATION_ATTEMPTS}: ${previousError}`,
      );
    }
  }
  if (entries.length > 1) {
    const midpoint = Math.ceil(entries.length / 2);
    console.warn(`Split failed batch of ${entries.length}`);
    return [
      ...(await generateBatch(entries.slice(0, midpoint))),
      ...(await generateBatch(entries.slice(midpoint))),
    ];
  }
  throw lastError;
}

async function toGenerationEntries(batch: Candidate[]): Promise<GenerationEntry[]> {
  return Promise.all(batch.map(async ({ question, scenario }) => {
    const answerIndexes = Array.isArray(question.answer)
      ? question.answer
      : [question.answer];
    const answerLabel = answerIndexes.map((answer) => LABELS[answer]).join("・");
    return {
      id: question.id,
      problem: withoutFigureMarkers(question.text),
      options: question.options.map((option, index) => `${LABELS[index]} ${option}`),
      correct: answerIndexes
        .map((answer) => `${LABELS[answer]} ${question.options[answer]}`)
        .join(" / "),
      answerLabel,
      context: fullScenarioContext(scenario.scenario),
      sourceEvidence: await fetchFactCheckNotes(question),
      figureBased: question.audit.requiresOfficialFigure,
    };
  }));
}

async function main(): Promise<void> {
  if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 6) {
    throw new Error(`Invalid SG_PM_EXPLANATION_BATCH_SIZE: ${BATCH_SIZE}`);
  }
  const data = JSON.parse(fs.readFileSync(INPUT, "utf8")) as {
    scenarios: PmScenario[];
  };
  const scenarios = groupPmScenarios(data.scenarios);
  const output = readExisting();
  let normalizedCachedItem = false;
  for (const item of output.items) {
    const normalized = normalizeEditorialPhrasing(item.explanation).trim();
    if (normalized !== item.explanation) {
      item.explanation = normalized;
      normalizedCachedItem = true;
    }
  }
  if (normalizedCachedItem) writeOutput(output);
  const completed = new Set(output.items.map((item) => item.id));
  const factCheckedCandidates: Candidate[] = scenarios
    .flatMap((scenario) => scenario.questions.map((question) => ({ question, scenario })))
    .filter(({ question }) => question.audit.factCheckAvailable);
  if (AUDIT_EXISTING) {
    const corrections = fs.existsSync(EXPLANATION_CORRECTIONS)
      ? (JSON.parse(fs.readFileSync(EXPLANATION_CORRECTIONS, "utf8")) as {
          items?: GeneratedItem[];
        }).items ?? []
      : [];
    // This command audits generated drafts. Corrections for the separately
    // reviewed no-note set are validated by the final builder instead.
    const correctionById = new Map(
      corrections
        .filter((item) => completed.has(item.id))
        .map((item) => [item.id, item]),
    );
    const cachedById = new Map(
      output.items.map((item) => [item.id, correctionById.get(item.id) ?? item]),
    );
    const cachedCandidates = factCheckedCandidates.filter(({ question }) =>
      completed.has(question.id),
    );
    for (let start = 0; start < cachedCandidates.length; start += 6) {
      const entries = await toGenerationEntries(cachedCandidates.slice(start, start + 6));
      validateBatch(
        entries.map((entry) => ({
          id: entry.id,
          answerLabel: entry.answerLabel,
          notes: entry.sourceEvidence,
          problem: entry.problem,
          figureBased: entry.figureBased,
          humanReviewed: correctionById.has(entry.id),
        })),
        entries.map((entry) => {
          const item = cachedById.get(entry.id);
          if (!item) throw new Error(`${entry.id}: cached explanation is missing`);
          return item;
        }),
      );
    }
    writeOutput(output);
    const audit = {
      checkedAt: new Date().toISOString(),
      model: output.model,
      promptVersion: output.promptVersion,
      generatedExplanationCount: cachedCandidates.length,
      correctedExplanationCount: correctionById.size,
      figureBasedExplanationCount: cachedCandidates.filter(
        ({ question }) => question.audit.requiresOfficialFigure,
      ).length,
      explanationSha256: sha256(
        JSON.stringify(
          [...cachedById.values()].sort((left, right) =>
            left.id.localeCompare(right.id),
          ),
        ),
      ),
      violations: 0,
    };
    fs.writeFileSync(QUALITY_AUDIT_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(audit, null, 2));
    return;
  }
  const candidates: Candidate[] = factCheckedCandidates
    .filter(({ question }) => !completed.has(question.id))
    .slice(0, LIMIT);
  const manualCount = scenarios
    .flatMap((scenario) => scenario.questions)
    .filter((question) => !question.audit.factCheckAvailable).length;
  console.log(
    `Model ${MODEL}; ${candidates.length} remaining PM explanations (${output.items.length} cached, ${manualCount} no-note items require manual source review)`,
  );
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const entries = await toGenerationEntries(batch);
    const generated = await generateBatch(entries);
    output.items.push(...generated);
    writeOutput(output);
    console.log(
      `Generated ${Math.min(start + batch.length, candidates.length)}/${candidates.length}; cache ${output.items.length}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
