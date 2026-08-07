/**
 * 問題データの構造バリデーションスクリプト
 *
 * data/ 配下の JSON ファイルを検証し、不整合があればエラーを出力する。
 * GitHub Actions から実行される。
 *
 * 使い方: npx tsx scripts/validate-schema.ts
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { getLearningSlugs } from "../src/lib/learning-content";
import {
  getLearningMap,
  validateLearningContentRegistry,
} from "../src/lib/learning";
import { getLearningImageMetas } from "../src/lib/learning-images";

// ---------------------------------------------------------------------------
// 型定義（ランタイムチェック用に独立して定義）
// ---------------------------------------------------------------------------

const VALID_STYLES = ["oneshot", "scenario"] as const;
const VALID_TYPES = ["single-choice", "multiple-choice"] as const;
const VALID_CATEGORY_GROUPS = ["certification", "lab", "demo"] as const;
const VALID_SOURCE_KINDS = ["official-past", "official-sample"] as const;
const VALID_PUBLICATION_STATUSES = ["published", "not-published"] as const;
const VALID_EXERCISE_STATUSES = [
  "complete",
  "partial",
  "pending",
  "excluded",
  "unsupported-format",
  "not-available",
] as const;
const MAX_OPTION_COUNT = 10;
const OPTION_LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
let errorCount = 0;

function error(msg: string) {
  console.error(`  ❌ ${msg}`);
  errorCount++;
}

function info(msg: string) {
  console.log(`  ✔ ${msg}`);
}

function cryptoHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSvgForHash(value: string) {
  return value.replace(/\r\n/g, "\n");
}

// ---------------------------------------------------------------------------
// categories.json の検証
// ---------------------------------------------------------------------------

function validateCategories(): string[] {
  const filePath = path.join(DATA_DIR, "categories.json");
  console.log("\n📂 categories.json");

  if (!fs.existsSync(filePath)) {
    error("categories.json が見つかりません");
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  let categories: unknown[];
  try {
    categories = JSON.parse(raw);
  } catch {
    error("JSON パースエラー");
    return [];
  }

  if (!Array.isArray(categories)) {
    error("配列である必要があります");
    return [];
  }

  const ids: string[] = [];

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i] as Record<string, unknown>;
    const prefix = `[${i}]`;

    if (!c.id || typeof c.id !== "string") error(`${prefix} id が未設定`);
    if (!c.name || typeof c.name !== "string") error(`${prefix} name が未設定`);
    if (!c.description || typeof c.description !== "string")
      error(`${prefix} description が未設定`);
    if (!VALID_CATEGORY_GROUPS.includes(c.group as typeof VALID_CATEGORY_GROUPS[number]))
      error(`${prefix} group が不正: ${c.group}`);
    if (!VALID_STYLES.includes(c.defaultStyle as typeof VALID_STYLES[number]))
      error(`${prefix} defaultStyle が不正: ${c.defaultStyle}`);
    if (typeof c.timeLimit !== "number" || c.timeLimit <= 0)
      error(`${prefix} timeLimit が不正: ${c.timeLimit}`);

    if (typeof c.id === "string") {
      if (ids.includes(c.id)) {
        error(`${prefix} id "${c.id}" が重複`);
      }
      ids.push(c.id);
    }
  }

  info(`${categories.length} カテゴリ、${ids.length} 個の有効な ID`);
  return ids;
}

// ---------------------------------------------------------------------------
// 問題の検証
// ---------------------------------------------------------------------------

function normalizeQuestionContent(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，、,.．。・:：;；'"「」『』（）()\[\]【】]/g, "");
}

function validateMarkdownImages(value: string, prefix: string) {
  if (value.includes("[[OFFICIAL_FIGURE:")) {
    error(`${prefix} に未解決の公式図版マーカーがあります`);
  }
  for (const match of value.matchAll(/!\[[^\]]*\]\((\/[^)]+)\)/g)) {
    const imagePath = match[1];
    if (!fs.existsSync(path.join(process.cwd(), "public", imagePath))) {
      error(`${prefix} のMarkdown画像が見つかりません: ${imagePath}`);
    }
  }
}

function validateSgPublicPayload(
  value: unknown,
  prefix: string,
  categoryId: string,
) {
  if (categoryId !== "sg") return;
  const serialized = JSON.stringify(value);
  const forbidden = [
    "sg-siken.com",
    "過去問道場",
    "transcriptionUrl",
    "factCheckNotes",
    "sourceEvidence",
    "answerSlots",
    "[[OFFICIAL_FIGURE:",
    "：:",
    "::",
    "セキュリテイ",
    "賞任者",
    "影騨",
    "とおリ",
  ];
  for (const marker of forbidden) {
    if (serialized.includes(marker)) {
      error(`${prefix} に内部取込情報が残っています: ${marker}`);
    }
  }
}

function hasRepeatedExplanationSentence(value: string): boolean {
  const sentences = value
    .replace(
      /^\*\*正解：[アイウエオカキクケコ](?:・[アイウエオカキクケコ])*\*\*\s*/,
      "",
    )
    .split(/[。！？\n]/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 16);
  return new Set(sentences).size !== sentences.length;
}

function hasRepeatedLongExplanationPhrase(value: string, windowLength = 18): boolean {
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

function validateSourceReference(
  value: unknown,
  prefix: string,
  categoryId: string,
  sourceById: Map<string, Record<string, unknown>>,
  questionNumbersBySourceId: Map<string, string[]>
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    error(`${prefix} がオブジェクトでない`);
    return null;
  }

  const source = value as Record<string, unknown>;
  const sourceId = source.sourceId;
  const questionNumber = source.questionNumber;
  let sourceSet: Record<string, unknown> | undefined;

  if (typeof sourceId !== "string" || sourceId.trim() === "") {
    error(`${prefix}.sourceId が未設定`);
  } else {
    sourceSet = sourceById.get(sourceId);
    if (!sourceSet) {
      error(`${prefix}.sourceId "${sourceId}" が sources.json に存在しません`);
    } else if (sourceSet.publicationStatus !== "published") {
      error(`${prefix} は非公開の sourceId "${sourceId}" を参照できません`);
    } else if (
      sourceSet.exerciseStatus === "pending" ||
      sourceSet.exerciseStatus === "excluded" ||
      sourceSet.exerciseStatus === "not-available" ||
      sourceSet.exerciseStatus === "unsupported-format"
    ) {
      error(
        `${prefix}.sourceId "${sourceId}" の exerciseStatus (${sourceSet.exerciseStatus}) と収録済み問題が矛盾します`
      );
    }
    if (categoryId === "sg" && sourceSet?.kind !== "official-past") {
      error(`${prefix} SGの本番問題はofficial-pastだけを参照できます`);
    }
  }

  if (typeof questionNumber !== "string" || questionNumber.trim() === "") {
    error(`${prefix}.questionNumber が未設定`);
  } else if (typeof sourceId === "string") {
    const registeredQuestionNumbers = questionNumber
      .split("・")
      .map((number) => number.trim());
    if (
      registeredQuestionNumbers.some((number) => number === "") ||
      new Set(registeredQuestionNumbers).size !== registeredQuestionNumbers.length
    ) {
      error(`${prefix}.questionNumber の統合問番号が不正`);
    }
    const registered = questionNumbersBySourceId.get(sourceId) ?? [];
    registered.push(...registeredQuestionNumbers);
    questionNumbersBySourceId.set(sourceId, registered);
  }

  if (typeof source.modified !== "boolean") {
    error(`${prefix}.modified が真偽値でない`);
  }
  if (
    source.modificationNote !== undefined &&
    (typeof source.modificationNote !== "string" ||
      source.modificationNote.trim() === "")
  ) {
    error(`${prefix}.modificationNote が不正`);
  }
  if (source.originalAnswer !== undefined) {
    const answers = Array.isArray(source.originalAnswer)
      ? source.originalAnswer
      : [source.originalAnswer];
    if (
      answers.length < 1 ||
      answers.some(
        (answer) =>
          typeof answer !== "number" ||
          !Number.isInteger(answer) ||
          answer < 0 ||
          answer >= MAX_OPTION_COUNT
      ) ||
      new Set(answers).size !== answers.length
    ) {
      error(`${prefix}.originalAnswer が不正`);
    }
  }
  if (
    source.modified === true &&
    !source.modificationNote &&
    !sourceSet?.defaultModificationNote
  ) {
    error(`${prefix} 改変内容が問題又はsources.jsonに記載されていません`);
  }

  return typeof sourceId === "string" && typeof questionNumber === "string"
    ? `${sourceId}\u0000${questionNumber}`
    : null;
}

function validateQuestion(
  q: Record<string, unknown>,
  prefix: string,
  categoryId: string,
  allIds: Set<string>,
  sourceById: Map<string, Record<string, unknown>>,
  questionNumbersBySourceId: Map<string, string[]>,
  contentOwnerByKey: Map<string, string>
) {
  validateSgPublicPayload(q, prefix, categoryId);

  // ID
  if (!q.id || typeof q.id !== "string") {
    error(`${prefix} id が未設定`);
  } else {
    if (allIds.has(q.id)) {
      error(`${prefix} id "${q.id}" がカテゴリ横断で重複`);
    }
    allIds.add(q.id);
  }

  // style
  if (q.style && !VALID_STYLES.includes(q.style as typeof VALID_STYLES[number])) {
    error(`${prefix} style が不正: ${q.style}`);
  }

  // type
  if (!VALID_TYPES.includes(q.type as typeof VALID_TYPES[number])) {
    error(`${prefix} type が不正: ${q.type}`);
  }

  // text
  if (!q.text || typeof q.text !== "string" || (q.text as string).trim() === "") {
    error(`${prefix} 問題文が空`);
  } else {
    validateMarkdownImages(q.text as string, `${prefix} text`);
  }
  if (q.image !== undefined && q.image !== null) {
    if (typeof q.image !== "string" || !q.image.startsWith("/")) {
      error(`${prefix} image はpublic配下の絶対パスにしてください`);
    } else if (!fs.existsSync(path.join(process.cwd(), "public", q.image))) {
      error(`${prefix} image が見つかりません: ${q.image}`);
    }
  }

  // options
  if (!Array.isArray(q.options)) {
    error(`${prefix} options が配列でない`);
  } else {
    const opts = q.options as string[];
    if (opts.length < 2 || opts.length > MAX_OPTION_COUNT) {
      error(`${prefix} 選択肢数が範囲外: ${opts.length}（2〜${MAX_OPTION_COUNT}）`);
    }
    for (let i = 0; i < opts.length; i++) {
      if (!opts[i] || typeof opts[i] !== "string" || opts[i].trim() === "") {
        error(`${prefix} options[${i}] が空`);
      }
    }
    // 選択肢の重複チェック
    const unique = new Set(opts.map((o) => o.trim()));
    if (unique.size !== opts.length) {
      error(`${prefix} 選択肢に重複あり`);
    }

    // answer の範囲チェック
    const optLen = opts.length;
    if (q.type === "single-choice") {
      if (typeof q.answer !== "number") {
        error(`${prefix} single-choice の answer が数値でない`);
      } else if (q.answer < 0 || q.answer >= optLen) {
        error(`${prefix} answer(${q.answer}) が options 範囲外（0〜${optLen - 1}）`);
      }
    } else if (q.type === "multiple-choice") {
      if (!Array.isArray(q.answer)) {
        error(`${prefix} multiple-choice の answer が配列でない`);
      } else {
        const ans = q.answer as number[];
        if (ans.length < 1) {
          error(`${prefix} answer が空配列`);
        }
        if (new Set(ans).size !== ans.length) {
          error(`${prefix} answer に重複があります`);
        }
        for (const a of ans) {
          if (typeof a !== "number" || a < 0 || a >= optLen) {
            error(`${prefix} answer 値 ${a} が options 範囲外`);
          }
        }
        if (q.selectionLimit !== undefined) {
          if (
            !Number.isInteger(q.selectionLimit) ||
            (q.selectionLimit as number) < 2 ||
            (q.selectionLimit as number) > optLen ||
            q.selectionLimit !== ans.length
          ) {
            error(`${prefix} selectionLimit は正答数と同じ2以上の整数にしてください`);
          }
        }
      }
    }
    if (q.type !== "multiple-choice" && q.selectionLimit !== undefined) {
      error(`${prefix} selectionLimit は複数選択問題だけに設定できます`);
    }
  }

  if (
    typeof q.id === "string" &&
    typeof q.text === "string" &&
    Array.isArray(q.options) &&
    q.options.every((option) => typeof option === "string")
  ) {
    const contentKey = `${normalizeQuestionContent(q.text)}\u0000${(q.options as string[])
      .map(normalizeQuestionContent)
      .sort()
      .join("\u0001")}`;
    const owner = contentOwnerByKey.get(contentKey);
    if (owner) {
      error(`${prefix} 問題内容が "${owner}" と重複しています`);
    } else {
      contentOwnerByKey.set(contentKey, q.id);
    }
  }

  // explanation
  if (!q.explanation || typeof q.explanation !== "string" || (q.explanation as string).trim() === "") {
    error(`${prefix} 解説が空`);
  } else if (categoryId === "sg") {
    const explanation = q.explanation as string;
    if (explanation.length < 60 || explanation.length > 700) {
      error(`${prefix} SG解説の長さが不正: ${explanation.length}`);
    }
    if (
      (q.type === "single-choice" && typeof q.answer === "number") ||
      (q.type === "multiple-choice" && Array.isArray(q.answer))
    ) {
      const answerIndexes = Array.isArray(q.answer)
        ? (q.answer as number[])
        : [q.answer as number];
      const expectedAnswer = answerIndexes
        .map((answer) => OPTION_LABELS[answer])
        .join("・");
      const statedAnswer = explanation.match(
        /正解(?:は|：)\s*[「]?([アイウエオカキクケコ](?:・[アイウエオカキクケコ])*)/
      )?.[1];
      if (statedAnswer !== expectedAnswer) {
        error(`${prefix} SG解説の正解記号がanswerと一致しません`);
      }
    }
    if (hasRepeatedExplanationSentence(explanation)) {
      error(`${prefix} SG解説に同じ文の繰返しがあります`);
    }
    if (q.style === "scenario" && hasRepeatedLongExplanationPhrase(explanation)) {
      error(`${prefix} SG長文解説に同じ長句の繰返しがあります`);
    }
    if (
      q.style === "scenario" &&
      /(?:他の|それ以外の)(?:選択肢|グループ|案|項目)/.test(explanation)
    ) {
      error(`${prefix} SG長文解説が誤答を一括処理しています`);
    }
    if (
      /(?:他の|それ以外の)(?:選択肢|グループ|案|項目).{0,65}(?:関係がない|記載されていない|該当しない|一致しない|形式が異なる|適切でない|不適切|誤りである|合わない)/.test(
        explanation,
      )
    ) {
      error(`${prefix} SG解説が誤答理由を具体化していません`);
    }
  }

  // domain
  if (
    q.domain !== undefined &&
    (typeof q.domain !== "string" || q.domain.trim() === "")
  ) {
    error(`${prefix} domain が不正`);
  }
  if (q.domains !== undefined) {
    if (!Array.isArray(q.domains) || q.domains.length < 2) {
      error(`${prefix} domains は重複統合時の2件以上の配列にしてください`);
    } else {
      const domains = q.domains as unknown[];
      if (domains.some((domain) => typeof domain !== "string" || domain.trim() === "")) {
        error(`${prefix} domains に不正な値があります`);
      }
      if (new Set(domains).size !== domains.length) {
        error(`${prefix} domains に重複があります`);
      }
      if (typeof q.domain === "string" && !domains.includes(q.domain)) {
        error(`${prefix} domain が domains に含まれていません`);
      }
    }
  }

  // source
  const occurrenceKeys: string[] = [];
  if (q.source !== undefined) {
    const key = validateSourceReference(
      q.source,
      `${prefix} source`,
      categoryId,
      sourceById,
      questionNumbersBySourceId
    );
    if (key) occurrenceKeys.push(key);
  }
  if (q.sourceOccurrences !== undefined) {
    if (!q.source) {
      error(`${prefix} sourceOccurrencesには主出典sourceが必要です`);
    }
    if (!Array.isArray(q.sourceOccurrences) || q.sourceOccurrences.length < 1) {
      error(`${prefix} sourceOccurrences が空又は配列でない`);
    } else {
      for (let index = 0; index < q.sourceOccurrences.length; index++) {
        const key = validateSourceReference(
          q.sourceOccurrences[index],
          `${prefix} sourceOccurrences[${index}]`,
          categoryId,
          sourceById,
          questionNumbersBySourceId
        );
        if (key) occurrenceKeys.push(key);
      }
    }
  }
  if (new Set(occurrenceKeys).size !== occurrenceKeys.length) {
    error(`${prefix} 出題履歴に同じsourceIdと問番号が重複しています`);
  }
  if (typeof q.explanation === "string" && /(^|\n)出典[：:]/.test(q.explanation)) {
    error(`${prefix} 出典はexplanationではなくsourceで管理してください`);
  }
}

function validateHttpsUrl(value: unknown, prefix: string) {
  if (typeof value !== "string") {
    error(`${prefix} が文字列でない`);
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") error(`${prefix} はhttps URLにしてください`);
  } catch {
    error(`${prefix} が不正です: ${value}`);
  }
}

function validateSourceDocument(value: unknown, prefix: string, hashRequired: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    error(`${prefix} がオブジェクトでない`);
    return;
  }

  const document = value as Record<string, unknown>;
  validateHttpsUrl(document.url, `${prefix}.url`);
  if (
    document.sha256 !== undefined &&
    (typeof document.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(document.sha256))
  ) {
    error(`${prefix}.sha256 が不正`);
  }
  if (hashRequired && typeof document.sha256 !== "string") {
    error(`${prefix}.sha256 はcomplete資料で必須です`);
  }
}

function validateQuestionSources(
  categoryId: string,
  examDir: string
): Map<string, Record<string, unknown>> {
  const sourcePath = path.join(examDir, "sources.json");
  const sourceById = new Map<string, Record<string, unknown>>();
  if (!fs.existsSync(sourcePath)) return sourceById;

  let registry: Record<string, unknown>;
  try {
    registry = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
  } catch {
    error("sources.json パースエラー");
    return sourceById;
  }

  if (registry.categoryId !== categoryId) {
    error(`sources.json の categoryId (${registry.categoryId}) がディレクトリ名 (${categoryId}) と不一致`);
  }

  if (!registry.publisher || typeof registry.publisher !== "object") {
    error("sources.json publisher が未設定");
  } else {
    const publisher = registry.publisher as Record<string, unknown>;
    if (typeof publisher.name !== "string" || publisher.name.trim() === "") {
      error("sources.json publisher.name が未設定");
    }
    validateHttpsUrl(publisher.reusePolicyUrl, "sources.json publisher.reusePolicyUrl");
  }

  if (!Array.isArray(registry.sources)) {
    error("sources.json sources が配列でない");
    return sourceById;
  }

  for (let index = 0; index < registry.sources.length; index++) {
    const source = registry.sources[index] as Record<string, unknown>;
    const prefix = `sources[${index}]`;
    const sourceId = source.id;

    if (typeof sourceId !== "string" || sourceId.trim() === "") {
      error(`${prefix} id が未設定`);
    } else if (sourceById.has(sourceId)) {
      error(`${prefix} id "${sourceId}" が重複`);
    } else {
      sourceById.set(sourceId, source);
    }

    if (!VALID_SOURCE_KINDS.includes(source.kind as typeof VALID_SOURCE_KINDS[number])) {
      error(`${prefix} kind が不正: ${source.kind}`);
    }
    if (typeof source.title !== "string" || source.title.trim() === "") {
      error(`${prefix} title が未設定`);
    }
    if (typeof source.section !== "string" || source.section.trim() === "") {
      error(`${prefix} section が未設定`);
    }
    if (
      !VALID_PUBLICATION_STATUSES.includes(
        source.publicationStatus as typeof VALID_PUBLICATION_STATUSES[number]
      )
    ) {
      error(`${prefix} publicationStatus が不正: ${source.publicationStatus}`);
    }
    if (
      !VALID_EXERCISE_STATUSES.includes(
        source.exerciseStatus as typeof VALID_EXERCISE_STATUSES[number]
      )
    ) {
      error(`${prefix} exerciseStatus が不正: ${source.exerciseStatus}`);
    }
    validateHttpsUrl(source.officialPageUrl, `${prefix}.officialPageUrl`);

    if (categoryId === "sg" && source.publicationStatus === "published") {
      for (const [name, value] of [
        ["officialPageUrl", source.officialPageUrl],
        ["questionPdf.url", (source.questionPdf as Record<string, unknown> | undefined)?.url],
        ["answerPdf.url", (source.answerPdf as Record<string, unknown> | undefined)?.url],
        ["commentaryPdf.url", (source.commentaryPdf as Record<string, unknown> | undefined)?.url],
      ] as const) {
        if (value === undefined) continue;
        try {
          const hostname = new URL(String(value)).hostname;
          if (hostname !== "ipa.go.jp" && !hostname.endsWith(".ipa.go.jp")) {
            error(`${prefix}.${name} はIPA公式ドメインではありません: ${hostname}`);
          }
        } catch {
          // URL自体のエラーはvalidateHttpsUrlで報告する。
        }
      }
    }

    if (
      !Number.isInteger(source.publishedQuestionCount) ||
      (source.publishedQuestionCount as number) < 0
    ) {
      error(`${prefix} publishedQuestionCount が不正`);
    }
    if (
      source.publishedMajorQuestionCount !== undefined &&
      (!Number.isInteger(source.publishedMajorQuestionCount) ||
        (source.publishedMajorQuestionCount as number) < 1 ||
        (source.publishedMajorQuestionCount as number) >
          (source.publishedQuestionCount as number))
    ) {
      error(`${prefix} publishedMajorQuestionCount が不正`);
    }
    if (
      source.playableQuestionCount !== undefined &&
      (!Number.isInteger(source.playableQuestionCount) ||
        (source.playableQuestionCount as number) < 1 ||
        (source.playableQuestionCount as number) >
          (source.publishedQuestionCount as number))
    ) {
      error(`${prefix} playableQuestionCount が不正`);
    }

    if (source.publicationStatus === "not-published") {
      if (source.publishedQuestionCount !== 0) {
        error(`${prefix} 非公開資料の publishedQuestionCount は0にしてください`);
      }
      if (source.questionPdf || source.answerPdf || source.commentaryPdf) {
        error(`${prefix} 非公開資料にPDF URLを設定しないでください`);
      }
      if (source.exerciseStatus !== "not-available") {
        error(`${prefix} 非公開資料の exerciseStatus はnot-availableにしてください`);
      }
      continue;
    }

    validateSourceDocument(source.questionPdf, `${prefix}.questionPdf`, true);
    if (source.answerPdf !== undefined) {
      validateSourceDocument(source.answerPdf, `${prefix}.answerPdf`, true);
    } else {
      error(`${prefix}.answerPdf は公開資料で必須です`);
    }
    if (source.commentaryPdf !== undefined) {
      validateSourceDocument(source.commentaryPdf, `${prefix}.commentaryPdf`, true);
    }

    if (source.exerciseStatus === "complete") {
      if (!Array.isArray(source.expectedQuestionNumbers)) {
        error(`${prefix} expectedQuestionNumbers はcomplete資料で必須です`);
      } else {
        const numbers = source.expectedQuestionNumbers as unknown[];
        if (numbers.length !== source.publishedQuestionCount) {
          error(
            `${prefix} expectedQuestionNumbers (${numbers.length}) と publishedQuestionCount (${source.publishedQuestionCount}) が不一致`
          );
        }
        if (numbers.some((number) => typeof number !== "string" || number.trim() === "")) {
          error(`${prefix} expectedQuestionNumbers に不正な値があります`);
        }
        if (new Set(numbers).size !== numbers.length) {
          error(`${prefix} expectedQuestionNumbers が重複しています`);
        }
      }
    }
  }

  info(`sources.json: ${sourceById.size} 資料セット`);
  return sourceById;
}

function validateSourceCoverage(
  sourceById: Map<string, Record<string, unknown>>,
  questionNumbersBySourceId: Map<string, string[]>
) {
  for (const [sourceId, source] of sourceById) {
    const actual = questionNumbersBySourceId.get(sourceId) ?? [];
    if (source.exerciseStatus === "complete") {
      const expected = (source.expectedQuestionNumbers ?? []) as string[];
      const actualSet = new Set(actual);
      const expectedSet = new Set(expected);
      const missing = expected.filter((number) => !actualSet.has(number));
      const unexpected = actual.filter((number) => !expectedSet.has(number));
      const duplicated = actual.filter(
        (number, index) => actual.indexOf(number) !== index
      );

      if (missing.length > 0) {
        error(`sourceId "${sourceId}" の未収録問番号: ${missing.join(", ")}`);
      }
      if (unexpected.length > 0) {
        error(`sourceId "${sourceId}" の想定外問番号: ${unexpected.join(", ")}`);
      }
      if (duplicated.length > 0) {
        error(`sourceId "${sourceId}" の問番号が重複: ${[...new Set(duplicated)].join(", ")}`);
      }
    } else if (
      actual.length > 0 &&
      (source.exerciseStatus === "pending" ||
        source.exerciseStatus === "excluded" ||
        source.exerciseStatus === "not-available" ||
        source.exerciseStatus === "unsupported-format")
    ) {
      error(`sourceId "${sourceId}" は${source.exerciseStatus}なのに問題参照があります`);
    }
  }
}

// ---------------------------------------------------------------------------
// カテゴリごとの問題データ検証
// ---------------------------------------------------------------------------

function validateExamData(categoryIds: string[]) {
  const allQuestionIds = new Set<string>();
  const contentOwnerByKey = new Map<string, string>();

  for (const catId of categoryIds) {
    const examDir = path.join(DATA_DIR, "exams", catId);
    console.log(`\n📂 ${catId}/`);

    if (!fs.existsSync(examDir)) {
      error(`ディレクトリが見つかりません: ${examDir}`);
      continue;
    }

    const sourceById = validateQuestionSources(catId, examDir);
    const questionNumbersBySourceId = new Map<string, string[]>();

    // meta.json
    const metaPath = path.join(examDir, "meta.json");
    if (!fs.existsSync(metaPath)) {
      error("meta.json が見つかりません");
    } else {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (meta.categoryId !== catId) {
          error(`meta.json の categoryId (${meta.categoryId}) がディレクトリ名 (${catId}) と不一致`);
        }
        info("meta.json OK");
      } catch {
        error("meta.json パースエラー");
      }
    }

    // questions.json
    const questionsPath = path.join(examDir, "questions.json");
    if (fs.existsSync(questionsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(questionsPath, "utf-8"));
        if (!Array.isArray(data.questions)) {
          error("questions.json の questions が配列でない");
        } else {
          for (let i = 0; i < data.questions.length; i++) {
            validateQuestion(
              data.questions[i],
              `questions[${i}]`,
              catId,
              allQuestionIds,
              sourceById,
              questionNumbersBySourceId,
              contentOwnerByKey
            );
          }
          info(`questions.json: ${data.questions.length} 問`);
        }
      } catch {
        error("questions.json パースエラー");
      }
    }

    // scenario-*.json
    const scenarioFiles = fs.existsSync(examDir)
      ? fs.readdirSync(examDir).filter((f) => f.startsWith("scenario-") && f.endsWith(".json"))
      : [];

    for (const sf of scenarioFiles) {
      const scenarioPath = path.join(examDir, sf);
      try {
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf-8"));
        const prefix = `${sf}`;

        if (!scenario.id || typeof scenario.id !== "string")
          error(`${prefix} id が未設定`);
        if (!scenario.title || typeof scenario.title !== "string")
          error(`${prefix} title が未設定`);
        if (!scenario.scenario || typeof scenario.scenario !== "string")
          error(`${prefix} scenario 本文が空`);
        else {
          validateMarkdownImages(scenario.scenario, `${prefix} scenario`);
          validateSgPublicPayload(scenario.scenario, `${prefix} scenario`, catId);
        }

        if (!Array.isArray(scenario.questions)) {
          error(`${prefix} questions が配列でない`);
        } else {
          for (let i = 0; i < scenario.questions.length; i++) {
              validateQuestion(
                scenario.questions[i],
                `${prefix} questions[${i}]`,
                catId,
                allQuestionIds,
                sourceById,
                questionNumbersBySourceId,
                contentOwnerByKey
              );
          }
          info(`${sf}: ${scenario.questions.length} 問`);
        }

        // シナリオ画像の存在チェック
        if (Array.isArray(scenario.scenarioImages)) {
          for (const img of scenario.scenarioImages) {
            const imgPath = path.join(process.cwd(), "public", img);
            if (!fs.existsSync(imgPath)) {
              error(`${prefix} 参照画像が見つかりません: ${img}`);
            }
          }
        }
      } catch {
        error(`${sf} パースエラー`);
      }
    }

    validateSourceCoverage(sourceById, questionNumbersBySourceId);
  }
}

// ---------------------------------------------------------------------------
// 学習マップの検証
// ---------------------------------------------------------------------------

function validateLearningData() {
  console.log("\n📂 learning-map.json");

  try {
    const learningMap = getLearningMap();
    validateLearningContentRegistry(learningMap, getLearningSlugs());
    info(`${learningMap.nodes.length} 学習ノード`);
  } catch (err) {
    error(err instanceof Error ? err.message : "learning-map.json の検証エラー");
  }
}

function listMdxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith(".mdx")) return [fullPath];
    return [];
  });
}

function getQuotedFigureAttrs(block: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const match of block.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function validateLearningAssets() {
  console.log("\n📂 learning assets");

  const contentDir = path.join(process.cwd(), "src", "content", "learning");
  const publicDir = path.join(process.cwd(), "public");
  const generatedAssetScript = path.join(
    process.cwd(),
    "scripts",
    "ensure-learning-assets.mjs"
  );
  const refs = new Set<string>();
  const imageMetas = getLearningImageMetas();
  const imageMetaBySrc = new Map(imageMetas.map((image) => [image.src, image]));

  for (const filePath of listMdxFiles(contentDir)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    for (const match of raw.matchAll(/src="(\/learning\/[^"]+)"/g)) {
      refs.add(match[1]);
    }

    for (const match of raw.matchAll(/<QuotedFigure\s+([\s\S]*?)>/g)) {
      const attrs = getQuotedFigureAttrs(match[1]);
      const imageMeta = attrs.src ? imageMetaBySrc.get(attrs.src) : undefined;
      if (!imageMeta) continue;

      const relPath = path.relative(process.cwd(), filePath);
      const expectedLicenseNote = `${imageMeta.licenseName} / ${imageMeta.publisher}`;
      const expectedAttrs = {
        sourceTitle: imageMeta.sourceTitle,
        sourceUrl: imageMeta.sourceUrl,
        licenseNote: expectedLicenseNote,
      };

      for (const [key, expectedValue] of Object.entries(expectedAttrs)) {
        if (attrs[key] !== expectedValue) {
          error(
            `${relPath} の ${attrs.src} は ${key} が learning-images.json と一致しません: ${attrs[key] ?? "(未指定)"}`
          );
        }
      }
    }
  }

  if (fs.existsSync(generatedAssetScript)) {
    error(
      "自動生成の学習画像スクリプトは禁止です: scripts/ensure-learning-assets.mjs"
    );
  }

  const seenManifestSrc = new Set<string>();
  for (const image of imageMetas) {
    if (seenManifestSrc.has(image.src)) {
      error(`learning-images.json の src が重複しています: ${image.src}`);
    }
    seenManifestSrc.add(image.src);

    if (image.kind !== "direct" && image.kind !== "adapted") {
      error(`画像は direct/adapted のみ許可: ${image.src}`);
    }
    if (image.kind === "adapted" && !image.modificationNote.trim()) {
      error(`加工引用の modificationNote が空です: ${image.src}`);
    }
    if (
      image.kind === "direct" &&
      /日本語化|簡略化|再作図/.test(image.modificationNote)
    ) {
      error(`直接引用画像を加工図として説明しないでください: ${image.src}`);
    }
    if (
      image.sourceLanguage === "en" &&
      (!("translationNote" in image) ||
        typeof image.translationNote !== "string" ||
        !image.translationNote.trim())
    ) {
      error(`英語出典画像は日本語の訳注が必要です: ${image.src}`);
    }
    if (
      image.assetLanguage !== "ja" &&
      image.assetLanguage !== "en" &&
      image.assetLanguage !== "multi"
    ) {
      error(`assetLanguage は ja/en/multi のみ許可: ${image.src}`);
    }
    for (const [key, value] of Object.entries(image)) {
      if (typeof value === "string" && value.trim() === "") {
        error(`learning-images.json の ${key} が空です: ${image.src}`);
      }
    }
    for (const urlKey of ["sourceUrl", "licenseUrl"] as const) {
      try {
        const url = new URL(image[urlKey]);
        if (url.protocol !== "https:") {
          error(`${urlKey} は https URL にしてください: ${image.src}`);
        }
      } catch {
        error(`${urlKey} が不正です: ${image.src}`);
      }
    }
  }

  for (const ref of [...refs].sort()) {
    const imageMeta = imageMetaBySrc.get(ref);
    if (!imageMeta) {
      error(`学習画像が learning-images.json に未登録です: ${ref}`);
    }

    const assetPath = path.join(publicDir, ref.slice(1));
    if (!fs.existsSync(assetPath)) {
      error(`学習コンテンツの参照画像が見つかりません: ${ref}`);
      continue;
    }

    if (path.extname(assetPath) === ".svg") {
      const rawAsset = fs.readFileSync(assetPath, "utf-8");
      if (rawAsset.includes("ExamServer learning diagram")) {
        error(`自動生成/自作図マーカーが残っています: ${ref}`);
      }

      if (imageMeta?.kind === "direct") {
        if (!/^[a-f0-9]{64}$/.test(imageMeta.localSha256 ?? "")) {
          error(`直接引用画像は localSha256 が必要です: ${ref}`);
        } else {
          const hash = cryptoHash(normalizeSvgForHash(rawAsset));
          if (hash !== imageMeta.localSha256) {
            error(`直接引用画像の SHA-256 が manifest と一致しません: ${ref}`);
          }
        }
      }
    }
  }

  for (const image of imageMetas) {
    if (!refs.has(image.src)) {
      error(`learning-images.json の画像が教材から参照されていません: ${image.src}`);
    }
  }

  info(`${refs.size} 個の学習画像参照`);
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------

console.log("=== ExamServer 問題データバリデーション ===");

const categoryIds = validateCategories();
validateExamData(categoryIds);
validateLearningData();
validateLearningAssets();

console.log(`\n${"=".repeat(40)}`);
if (errorCount > 0) {
  console.error(`\n❌ ${errorCount} 件のエラーが見つかりました`);
  process.exit(1);
} else {
  console.log("\n✅ すべてのチェックに通過しました");
  process.exit(0);
}
