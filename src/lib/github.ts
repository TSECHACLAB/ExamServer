/**
 * GitHub API ラッパー
 *
 * Octokit を使い、問題データ JSON をリポジトリに直接 commit する。
 * Vercel デプロイは push 後に自動で走る。
 */

import { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// 環境変数から設定を取得
// ---------------------------------------------------------------------------

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token || !owner || !repo) {
    throw new Error(
      "GitHub 環境変数が不足しています（GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO）"
    );
  }

  return { token, owner, repo, branch };
}

function getOctokit() {
  const { token } = getConfig();
  return new Octokit({ auth: token });
}

// ---------------------------------------------------------------------------
// Issue 操作
// ---------------------------------------------------------------------------

export interface CreateIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

/** GitHub Issue を作成する */
export async function createIssue({
  title,
  body,
  labels = issueLabelsFromEnv(),
}: CreateIssueInput): Promise<{ number: number; url: string }> {
  const { owner, repo, token } = getIssueConfig();
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });
    return { number: data.number, url: data.html_url };
  } catch (err: unknown) {
    if (labels.length === 0 || !hasStatus(err, 422)) {
      throw err;
    }

    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
    });
    return { number: data.number, url: data.html_url };
  }
}

function hasStatus(err: unknown, status: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === status
  );
}

function issueLabelsFromEnv(): string[] {
  return (process.env.BUG_REPORT_LABELS || "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function getIssueConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner =
    process.env.GITHUB_ISSUE_OWNER ||
    process.env.VERCEL_GIT_REPO_OWNER ||
    "TakesSecHacLab-team";
  const repo =
    process.env.GITHUB_ISSUE_REPO ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    "ExamServer";

  if (!token) {
    throw new Error("GitHub 環境変数が不足しています（GITHUB_TOKEN）");
  }

  return { token, owner, repo };
}

// ---------------------------------------------------------------------------
// ファイル操作
// ---------------------------------------------------------------------------

/** リポジトリ内のファイル内容を取得する */
export async function getFileContent(
  filePath: string
): Promise<{ content: string; sha: string } | null> {
  const { owner, repo, branch } = getConfig();
  const octokit = getOctokit();

  try {
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    const data = res.data;
    if (Array.isArray(data) || data.type !== "file") return null;

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

/** ファイルを作成または更新する（commit） */
export async function putFileContent(
  filePath: string,
  content: string,
  message: string,
  /** 既存ファイルの sha（更新時に必要） */
  sha?: string
): Promise<void> {
  const { owner, repo, branch } = getConfig();
  const octokit = getOctokit();

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
    sha,
  });
}

/** ファイルを削除する（commit） */
export async function deleteFile(
  filePath: string,
  sha: string,
  message: string
): Promise<void> {
  const { owner, repo, branch } = getConfig();
  const octokit = getOctokit();

  await octokit.repos.deleteFile({
    owner,
    repo,
    path: filePath,
    message,
    sha,
    branch,
  });
}

// ---------------------------------------------------------------------------
// トークン状態確認
// ---------------------------------------------------------------------------

export interface TokenStatus {
  valid: boolean;
  login?: string;
  error?: string;
}

/** GitHub トークンの有効性を確認する */
export async function checkTokenStatus(): Promise<TokenStatus> {
  try {
    const octokit = getOctokit();
    const { data } = await octokit.users.getAuthenticated();
    return { valid: true, login: data.login };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "不明なエラー";
    return {
      valid: false,
      error: `GitHub トークンが無効です。Settings > Developer settings で新しいトークンを生成してください。(${message})`,
    };
  }
}

// ---------------------------------------------------------------------------
// 問題データ用ヘルパー
// ---------------------------------------------------------------------------

/** 問題データ JSON ファイルのパスを返す */
export function questionsFilePath(categoryId: string): string {
  return `data/exams/${categoryId}/questions.json`;
}

/** シナリオファイルのパスを返す */
export function scenarioFilePath(
  categoryId: string,
  scenarioId: string
): string {
  return `data/exams/${categoryId}/${scenarioId}.json`;
}

/** メタ情報ファイルのパスを返す */
export function metaFilePath(categoryId: string): string {
  return `data/exams/${categoryId}/meta.json`;
}
