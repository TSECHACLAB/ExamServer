import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface SourceDocument {
  url: string;
  sha256: string;
}

interface SourceSet {
  id: string;
  officialPageUrl: string;
  questionPdf?: SourceDocument;
  answerPdf?: SourceDocument;
  commentaryPdf?: SourceDocument;
}

interface VerificationTarget {
  url: string;
  roles: string[];
  expectedSha256?: string;
}

const ROOT = path.resolve(import.meta.dirname, "..");
const REGISTRY = path.join(ROOT, "data", "exams", "sg", "sources.json");
const OUTPUT = path.join(
  ROOT,
  "artifacts",
  "question-content",
  "sg-official-source-verification.json",
);
const CONCURRENCY = 4;

function isIpaHost(url: string): boolean {
  const hostname = new URL(url).hostname;
  return hostname === "ipa.go.jp" || hostname.endsWith(".ipa.go.jp");
}

function collectTargets(sources: SourceSet[]): VerificationTarget[] {
  const targetByUrl = new Map<string, VerificationTarget>();
  const append = (url: string, role: string, expectedSha256?: string): void => {
    if (!isIpaHost(url)) throw new Error(`${url}: not an IPA official URL`);
    const existing = targetByUrl.get(url);
    if (existing) {
      existing.roles.push(role);
      if (
        expectedSha256 &&
        existing.expectedSha256 &&
        expectedSha256 !== existing.expectedSha256
      ) {
        throw new Error(`${url}: conflicting expected hashes`);
      }
      existing.expectedSha256 ??= expectedSha256;
      return;
    }
    targetByUrl.set(url, { url, roles: [role], expectedSha256 });
  };

  for (const source of sources) {
    append(source.officialPageUrl, `${source.id}:officialPage`);
    for (const key of ["questionPdf", "answerPdf", "commentaryPdf"] as const) {
      const document = source[key];
      if (document) append(document.url, `${source.id}:${key}`, document.sha256);
    }
  }
  return [...targetByUrl.values()].sort((left, right) =>
    left.url.localeCompare(right.url),
  );
}

async function verifyTarget(target: VerificationTarget) {
  const response = await fetch(target.url, {
    headers: { "user-agent": "ExamServer official-source verification/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${target.url}: HTTP ${response.status}`);
  if (!isIpaHost(response.url)) {
    throw new Error(`${target.url}: redirected outside IPA to ${response.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (target.expectedSha256 && sha256 !== target.expectedSha256) {
    throw new Error(
      `${target.url}: SHA-256 mismatch (${sha256}, expected ${target.expectedSha256})`,
    );
  }
  return {
    url: target.url,
    finalUrl: response.url,
    roles: target.roles,
    status: response.status,
    contentType: response.headers.get("content-type"),
    byteLength: bytes.length,
    sha256,
    expectedSha256: target.expectedSha256 ?? null,
    hashMatched: target.expectedSha256 ? true : null,
  };
}

async function main(): Promise<void> {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as {
    sources: SourceSet[];
  };
  const targets = collectTargets(registry.sources);
  const records: Awaited<ReturnType<typeof verifyTarget>>[] = [];
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < targets.length) {
      const target = targets[cursor];
      cursor += 1;
      const record = await verifyTarget(target);
      records.push(record);
      console.log(`[${records.length}/${targets.length}] ${target.url}`);
    }
  });
  await Promise.all(workers);
  records.sort((left, right) => left.url.localeCompare(right.url));

  const documentRecords = records.filter((record) => record.expectedSha256);
  const output = {
    checkedAt: new Date().toISOString(),
    sourceSetCount: registry.sources.length,
    uniqueUrlCount: records.length,
    hashedDocumentCount: documentRecords.length,
    hashMismatchCount: documentRecords.filter((record) => !record.hashMatched)
      .length,
    httpFailureCount: 0,
    records,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, OUTPUT);
  console.log(
    `Verified ${records.length} IPA URLs (${documentRecords.length} hash-matched documents)`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
