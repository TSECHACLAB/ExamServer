import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPOSITORY = "digital-go-jp/design-system-example-components-react";
const COMMIT = "22cda0df79f8f881953f11dca39e1c5a28619844";
const COMPONENTS = new Set([
  "Button", "Checkbox", "ChipLabel", "Disclosure", "Divider", "Heading",
  "Input", "Link", "ModalDialog", "NotificationBanner", "ProgressIndicator",
  "Radio", "Select", "Slot", "Textarea", "UtilityLink",
]);
const ROOT = process.cwd();
const LEGACY_TARGET = path.join(ROOT, "src", "vendor", "dads");
const UPSTREAM_TARGET = path.join(ROOT, "vendor", "dads");
const RUNTIME_TARGET = path.join(ROOT, "src", "vendor", "dads-runtime");
const UPSTREAM_MANIFEST_PATH = path.join(UPSTREAM_TARGET, "upstream-manifest.json");
const RUNTIME_MANIFEST_PATH = path.join(RUNTIME_TARGET, "adapter-manifest.json");
const CHECK = process.argv.includes("--check");
const ADAPTER_HEADER = "// Generated from the verified DADS upstream source. Do not edit.\n// @ts-nocheck\n";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function listLocalFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listLocalFiles(absolute, base)));
    else files.push(path.relative(base, absolute).replaceAll("\\", "/"));
  }
  return files;
}

function runtimeContent(relativePath, content) {
  return /\.tsx?$/.test(relativePath) ? Buffer.concat([Buffer.from(ADAPTER_HEADER), content]) : content;
}

async function verifyTree(target, manifestName, manifestFiles, label) {
  const expected = new Set(manifestFiles.map((file) => file.path));
  const local = (await listLocalFiles(target)).filter((file) => file !== manifestName);
  for (const file of local) {
    if (!expected.has(file)) throw new Error(`Untracked ${label} file: ${file}`);
  }
  for (const file of manifestFiles) {
    const content = await readFile(path.join(target, file.path));
    if (digest(content) !== file.sha256) throw new Error(`Modified ${label} file: ${file.path}`);
  }
}

async function verify() {
  const upstreamManifest = JSON.parse(await readFile(UPSTREAM_MANIFEST_PATH, "utf8"));
  const runtimeManifest = JSON.parse(await readFile(RUNTIME_MANIFEST_PATH, "utf8"));
  if (upstreamManifest.repository !== REPOSITORY || upstreamManifest.commit !== COMMIT) {
    throw new Error("DADS upstream manifest points to an unexpected source");
  }
  if (runtimeManifest.upstreamCommit !== COMMIT) {
    throw new Error("DADS runtime adapter points to an unexpected source");
  }

  await verifyTree(UPSTREAM_TARGET, "upstream-manifest.json", upstreamManifest.files, "DADS upstream");
  await verifyTree(RUNTIME_TARGET, "adapter-manifest.json", runtimeManifest.files, "DADS runtime adapter");

  for (const file of runtimeManifest.files) {
    const upstream = await readFile(path.join(UPSTREAM_TARGET, file.upstreamPath));
    const expected = runtimeContent(file.path, upstream);
    const runtime = await readFile(path.join(RUNTIME_TARGET, file.path));
    if (!expected.equals(runtime)) throw new Error(`DADS runtime adapter drift: ${file.path}`);
  }
  console.log(`DADS source and runtime adapter verified: ${upstreamManifest.files.length} upstream files @ ${COMMIT}`);
}

async function sync() {
  const treeResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/trees/${COMMIT}?recursive=1`, {
    headers: { "User-Agent": "ExamServer-DADS-Sync" },
  });
  if (!treeResponse.ok) throw new Error(`GitHub tree request failed: ${treeResponse.status}`);
  const tree = await treeResponse.json();
  const sourcePaths = tree.tree
    .filter((item) => item.type === "blob")
    .map((item) => item.path)
    .filter((sourcePath) => {
      if (sourcePath === "LICENSE") return true;
      const match = sourcePath.match(/^src\/components\/([^/]+)\/(.+)$/);
      return Boolean(match && COMPONENTS.has(match[1]) && /\.(tsx?|css)$/.test(sourcePath) && !/\.(stories|test)\./.test(sourcePath));
    })
    .sort();

  await rm(LEGACY_TARGET, { recursive: true, force: true });
  await rm(UPSTREAM_TARGET, { recursive: true, force: true });
  await rm(RUNTIME_TARGET, { recursive: true, force: true });
  await mkdir(UPSTREAM_TARGET, { recursive: true });
  await mkdir(RUNTIME_TARGET, { recursive: true });
  const upstreamFiles = [];
  const runtimeFiles = [];
  for (const sourcePath of sourcePaths) {
    const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${sourcePath}`);
    if (!response.ok) throw new Error(`Source download failed: ${sourcePath}`);
    const content = Buffer.from(await response.arrayBuffer());
    const relativePath = sourcePath === "LICENSE" ? "LICENSE" : sourcePath.replace(/^src\/components\//, "components/");
    const upstreamDestination = path.join(UPSTREAM_TARGET, relativePath);
    await mkdir(path.dirname(upstreamDestination), { recursive: true });
    await writeFile(upstreamDestination, content);
    upstreamFiles.push({ path: relativePath, sourcePath, sha256: digest(content) });

    if (sourcePath !== "LICENSE") {
      const adapted = runtimeContent(relativePath, content);
      const runtimeDestination = path.join(RUNTIME_TARGET, relativePath);
      await mkdir(path.dirname(runtimeDestination), { recursive: true });
      await writeFile(runtimeDestination, adapted);
      runtimeFiles.push({ path: relativePath, upstreamPath: relativePath, sha256: digest(adapted) });
    }
  }
  await writeFile(UPSTREAM_MANIFEST_PATH, `${JSON.stringify({
    schemaVersion: 1,
    repository: REPOSITORY,
    commit: COMMIT,
    sourceUrl: `https://github.com/${REPOSITORY}/tree/${COMMIT}`,
    files: upstreamFiles,
  }, null, 2)}\n`);
  await writeFile(RUNTIME_MANIFEST_PATH, `${JSON.stringify({
    schemaVersion: 1,
    upstreamCommit: COMMIT,
    adaptation: "Exact upstream content with a TypeScript no-check header for React 19 type compatibility",
    files: runtimeFiles,
  }, null, 2)}\n`);
  console.log(`DADS source synced: ${upstreamFiles.length} files @ ${COMMIT}`);
}

if (CHECK) await verify();
else await sync();
