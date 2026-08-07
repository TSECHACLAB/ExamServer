import fs from "node:fs";
import path from "node:path";

import { JSDOM } from "jsdom";

import { loadCanonicalSgMorningPool } from "./lib/sg-canonical-pool";

interface GeneratedItem {
  id: string;
  explanation: string;
}

interface OutputFile {
  generatedAt: string;
  model: string;
  items: GeneratedItem[];
}

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "legacy-sg-am-explanations.json",
);
const MODEL = process.env.SG_EXPLANATION_MODEL ?? "huihui-qwen-thinking:latest";
const BATCH_SIZE = Number(process.env.SG_EXPLANATION_BATCH_SIZE ?? 8);
const LIMIT_ARGUMENT = process.argv.find((argument) => argument.startsWith("--limit="));
const LIMIT = LIMIT_ARGUMENT ? Number(LIMIT_ARGUMENT.split("=")[1]) : Number.POSITIVE_INFINITY;
const FIGURES_ONLY = process.argv.includes("--figures-only");
const LABELS = ["ア", "イ", "ウ", "エ"];

function normalizeWhitespace(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFactCheckNotes(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "ExamServer explanation fact-check/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const document = new JSDOM(await response.text()).window.document;
  const explanation = document.querySelector("#kaisetsu");
  if (!explanation) throw new Error(`${url}: #kaisetsu was not found`);
  explanation.querySelectorAll("script, style, img").forEach((element) => element.remove());
  return normalizeWhitespace(explanation.textContent ?? "").slice(0, 1800);
}

function readExisting(): OutputFile {
  if (!fs.existsSync(OUTPUT)) {
    return { generatedAt: new Date().toISOString(), model: MODEL, items: [] };
  }
  const existing = JSON.parse(fs.readFileSync(OUTPUT, "utf8")) as OutputFile;
  if (existing.model !== MODEL) {
    throw new Error(`Existing explanation model is ${existing.model}; requested ${MODEL}`);
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
  const normalizedNotes = normalizeWhitespace(notes);
  return explanation
    .replace(/^\*\*正解：[アイウエ]\*\*\s*/, "")
    .split(/[。！？\n]/)
    .map(normalizeWhitespace)
    .some((sentence) => sentence.length >= 28 && normalizedNotes.includes(sentence));
}

function validateBatch(
  expected: { id: string; answerLabel: string; notes: string }[],
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
    const body = item.explanation
      .trim()
      .replace(/^\*\*正解：[アイウエ]\*\*\s*/, "")
      .replace(/^正解は[アイウエ]です。?\s*/, "");
    const explanation = `**正解：${expectation.answerLabel}**\n\n${body}`;
    if (explanation.length < 65 || explanation.length > 520) {
      throw new Error(`${expectation.id}: explanation length is ${explanation.length}`);
    }
    if (/sg-siken|過去問道場|確認メモ|参照メモ|上記/.test(explanation)) {
      throw new Error(`${expectation.id}: explanation exposes an internal aid`);
    }
    if (hasCopiedSentence(explanation, expectation.notes)) {
      throw new Error(`${expectation.id}: explanation contains a copied sentence`);
    }
    item.explanation = explanation;
  }
}

async function generateBatch(
  entries: {
    id: string;
    text: string;
    options: string[];
    answerLabel: string;
    correctOption: string;
    notes: string;
  }[],
): Promise<GeneratedItem[]> {
  const prompt = `あなたは情報セキュリティマネジメント試験の問題編集者です。次の問題ごとに、受験者が誤りを直せる短い解説を書いてください。

条件:
- explanationには根拠本文だけを書く。正答ラベルや「正解は〜」はコード側で付けるので書かない。
- 正答になる理由を具体的に説明し、主要な誤答が違う理由も少なくとも一つ示す。
- 90〜260字を目安にする。問題文の言い換えだけ、一般的な勉強法、励まし、出典紹介は書かない。
- 「確認用の事実メモ」は正確性確認だけに使い、文を転載しない。固有のサイト名やメモの存在も書かない。
- 与えられた情報で断定できない内容を足さない。
- 指定されたJSON以外を返さない。

問題:
${JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      problem: entry.text,
      options: entry.options.map((option, index) => `${LABELS[index]} ${option}`),
      correct: `${entry.answerLabel} ${entry.correctOption}`,
      factCheckNotes: entry.notes,
    })),
  )}`;
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
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          prompt:
            attempt === 1
              ? prompt
              : `${prompt}\n\n前回は形式又は品質条件に違反しました。全項目を別の文で書き直してください。`,
          stream: false,
          think: false,
          keep_alive: "30m",
          format: schema,
          options: {
            temperature: 0.15 + attempt * 0.05,
            num_ctx: 8192,
            num_predict: Math.max(500, entries.length * 300),
          },
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = (await response.json()) as { response?: string };
      const parsed = JSON.parse(payload.response ?? "") as { items?: GeneratedItem[] };
      const items = parsed.items ?? [];
      validateBatch(
        entries.map((entry) => ({
          id: entry.id,
          answerLabel: entry.answerLabel,
          notes: entry.notes,
        })),
        items,
      );
      return items;
    } catch (error) {
      lastError = error;
      console.warn(
        `Retry ${attempt}/2: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (entries.length > 1) {
    const midpoint = Math.ceil(entries.length / 2);
    console.warn(
      `Split failed batch of ${entries.length} into ${midpoint} + ${entries.length - midpoint}`,
    );
    return [
      ...(await generateBatch(entries.slice(0, midpoint))),
      ...(await generateBatch(entries.slice(midpoint))),
    ];
  }
  throw lastError;
}

async function main(): Promise<void> {
  if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 12) {
    throw new Error(`Invalid SG_EXPLANATION_BATCH_SIZE: ${BATCH_SIZE}`);
  }
  const groups = loadCanonicalSgMorningPool(ROOT);
  const output = readExisting();
  const completed = new Set(output.items.map((item) => item.id));
  const candidates = groups
    .map((group) => group.canonical)
    .filter((question) => question.audit)
    .filter(
      (question) =>
        (question.audit?.requiresOfficialFigure ?? false) === FIGURES_ONLY,
    )
    .filter((question) => !completed.has(question.id))
    .slice(0, LIMIT);

  console.log(
    `Model ${MODEL}; ${candidates.length} remaining text-only legacy explanations (${output.items.length} cached)`,
  );
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (question) => {
        const answerIndex = question.answer as number;
        const isFigureQuestion = question.audit!.requiresOfficialFigure;
        return {
          id: question.id,
          text: question.text,
          options: isFigureQuestion
            ? LABELS.map((label) => `公式図表の選択肢${label}`)
            : question.options,
          answerLabel: LABELS[answerIndex],
          correctOption: isFigureQuestion
            ? `公式図表の選択肢${LABELS[answerIndex]}`
            : question.options[answerIndex],
          notes: await fetchFactCheckNotes(question.audit!.transcriptionUrl),
        };
      }),
    );
    const generated = await generateBatch(entries);
    output.items.push(...generated);
    writeOutput(output);
    console.log(
      `Generated ${Math.min(start + batch.length, candidates.length)}/${candidates.length}; cache ${output.items.length}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
