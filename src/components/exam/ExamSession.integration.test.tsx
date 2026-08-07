// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getQuestions } from "@/app/api/questions/route";
import { POST as postAnswer } from "@/app/api/answers/route";
import { POST as postBatchAnswers } from "@/app/api/answers/batch/route";
import ExamSession from "@/components/exam/ExamSession";
import { createExamSessionFingerprint } from "@/lib/exam-session-config";
import type {
  Category,
  NormalizedExamSessionConfig,
  SessionStateV2,
} from "@/types/exam";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const category: Category = {
  id: "general",
  name: "一般常識(demo)",
  description: "一般常識のデモ問題",
  group: "demo",
  defaultStyle: "oneshot",
  timeLimit: 1800,
  passingScore: 60,
};

beforeEach(() => {
  routerPush.mockReset();
  sessionStorage.clear();
  localStorage.clear();
  installDialogPolyfill();
  vi.stubGlobal("fetch", routeFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("演習画面と実Route Handlerの結合", () => {
  it("最終問題から回答確認を経て採点し、version 2進捗を一度だけ保存する", async () => {
    const props = sessionProps("exam", 2);
    const view = render(<ExamSession {...props} />);

    await choose("日本の国花として広く親しまれている花はどれか？", "桜");
    expect(screen.getByText(/回答済み 1 \/ 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await choose("水の化学式として正しいものはどれか？", "H2O");

    fireEvent.click(screen.getByRole("button", { name: "回答状況を確認" }));
    expect(await screen.findByRole("heading", { name: "回答状況を確認" })).toBeInTheDocument();
    expect(screen.getByText(/済 回答済み/).parentElement).toHaveTextContent("2問");
    fireEvent.click(screen.getByRole("button", { name: "採点する" }));

    expect(await screen.findByRole("heading", { name: "演習結果" })).toBeInTheDocument();
    expect(screen.getByText("○ 合格")).toBeInTheDocument();
    expect(screen.getByText("100%", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("2 / 2問")).toBeInTheDocument();

    await waitFor(() => {
      const progress = storedProgress();
      expect(progress.version).toBe(2);
      expect(progress.categories.general).toMatchObject({ attempts: 1, bestScore: 100 });
      expect(progress.processedAttemptIds).toHaveLength(1);
    });

    view.unmount();
    render(<ExamSession {...props} />);
    expect(await screen.findByRole("heading", { name: "演習結果" })).toBeInTheDocument();
    await waitFor(() => {
      expect(storedProgress().categories.general.attempts).toBe(1);
    });
  });

  it("一問一答の結果・解説・位置を復元し、再送信せず完了する", async () => {
    let answerPosts = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(requestUrl(input), "https://example.test").pathname === "/api/answers") {
        answerPosts += 1;
      }
      return routeFetch(input, init);
    });
    const props = sessionProps("drill", 2);
    const first = render(<ExamSession {...props} />);

    await choose("日本の国花として広く親しまれている花はどれか？", "バラ");
    fireEvent.click(screen.getByRole("button", { name: "答え合わせ" }));
    expect(await screen.findByText("× 不正解")).toBeInTheDocument();
    expect(answerPosts).toBe(1);

    first.unmount();
    render(<ExamSession {...props} />);
    expect(await screen.findByText("× 不正解")).toBeInTheDocument();
    expect(answerPosts).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "次の問題へ" }));

    await choose("水の化学式として正しいものはどれか？", "H2O");
    fireEvent.click(screen.getByRole("button", { name: "答え合わせ" }));
    await waitFor(() => expect(screen.getAllByText("○ 正解").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "結果を見る" }));

    expect(await screen.findByRole("heading", { name: "演習結果" })).toBeInTheDocument();
    expect(screen.getByText("50%", { selector: "dd" })).toBeInTheDocument();
    await waitFor(() => expect(storedProgress().categories.general.attempts).toBe(1));
  });

  it("30分タイマーを期限時刻で保存し、再読込後も回答と現在位置を復元する", async () => {
    const props = sessionProps("exam", 2, true);
    const before = Date.now();
    const first = render(<ExamSession {...props} />);

    await choose("日本の国花として広く親しまれている花はどれか？", "桜");
    expect(screen.getByText("残り 30:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await screen.findByText("水の化学式として正しいものはどれか？");

    await waitFor(() => {
      const state = storedSession();
      expect(state.version).toBe(2);
      expect(state.deadlineAt).toBeGreaterThanOrEqual(before + 1_799_000);
      expect(state.answers[0].selectedAnswer).toBe(1);
      expect(state.currentIndex).toBe(1);
    });

    first.unmount();
    render(<ExamSession {...props} />);
    expect(await screen.findByText("水の化学式として正しいものはどれか？")).toBeInTheDocument();
    expect(screen.getByText(/回答済み 1 \/ 2/)).toBeInTheDocument();
  });

  it("期限切れでは自動採点を一度だけ行う", async () => {
    const props = sessionProps("exam", 1, true);
    const config = props.config;
    const expiredState: SessionStateV2 = {
      version: 2,
      attemptId: "expired-attempt",
      configFingerprint: config.fingerprint,
      categoryId: "general",
      mode: "exam",
      questionIds: ["general-001"],
      answers: [{
        questionId: "general-001",
        selectedAnswer: 1,
        flagged: false,
        uncertain: false,
      }],
      currentIndex: 0,
      deadlineAt: Date.now() - 1_000,
      phase: "active",
      drillResults: {},
      completedResult: null,
    };
    sessionStorage.setItem("exam-session-state", JSON.stringify(expiredState));
    let batchPosts = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(requestUrl(input), "https://example.test").pathname === "/api/answers/batch") {
        batchPosts += 1;
      }
      return routeFetch(input, init);
    });

    render(<ExamSession {...props} />);
    expect(await screen.findByRole("heading", { name: "演習結果" })).toBeInTheDocument();
    expect(screen.getByText(/制限時間が終了した時点/)).toBeInTheDocument();
    expect(batchPosts).toBe(1);
  });

  it("採点通信の失敗後に同じ操作を再試行でき、二重送信しない", async () => {
    let batchPosts = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(requestUrl(input), "https://example.test").pathname;
      if (pathname === "/api/answers/batch") {
        batchPosts += 1;
        if (batchPosts === 1) {
          return Response.json({ error: "一時的に採点できません" }, { status: 503 });
        }
      }
      return routeFetch(input, init);
    });

    render(<ExamSession {...sessionProps("exam", 1)} />);
    await choose("日本の国花として広く親しまれている花はどれか？", "桜");
    fireEvent.click(screen.getByRole("button", { name: "回答状況を確認" }));
    fireEvent.click(await screen.findByRole("button", { name: "採点する" }));
    expect(await screen.findByRole("heading", { name: "採点が止まりました" })).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: "直前の操作を再試行" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "演習結果" })).toBeInTheDocument();
    expect(batchPosts).toBe(2);
  });

  it("複数選択を全て外すと空配列ではなく未回答として保存する", async () => {
    render(<ExamSession {...sessionProps("exam", 3)} />);
    await screen.findByText("日本の国花として広く親しまれている花はどれか？");
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await screen.findByText(/日本に隣接する海として正しいもの/);

    const japanSea = screen.getByRole("checkbox", { name: "日本海" });
    fireEvent.click(japanSea);
    expect(screen.getByText(/回答済み 1 \/ 3/)).toBeInTheDocument();
    fireEvent.click(japanSea);
    expect(screen.getByText(/回答済み 0 \/ 3/)).toBeInTheDocument();
    await waitFor(() => expect(storedSession().answers[2].selectedAnswer).toBeNull());
  });
});

function sessionProps(
  mode: "exam" | "drill",
  questionCount: number,
  timerEnabled = false,
): { category: Category; config: NormalizedExamSessionConfig } {
  const base = {
    categoryId: "general",
    mode,
    questionCount,
    timerEnabled: mode === "exam" && timerEnabled,
    randomEnabled: false,
    selectedDomains: [],
    timeLimit: 1800,
    passingScore: 60,
    returnBucket: "other" as const,
  };
  return {
    category,
    config: { ...base, fingerprint: createExamSessionFingerprint(base) },
  };
}

async function choose(question: string, option: string) {
  expect(await screen.findByText(question)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: option }));
}

function storedSession(): SessionStateV2 {
  return JSON.parse(sessionStorage.getItem("exam-session-state") ?? "{}") as SessionStateV2;
}

function storedProgress() {
  return JSON.parse(localStorage.getItem("exam-server-progress") ?? "{}");
}

function installDialogPolyfill() {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

async function routeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(requestUrl(input), "https://example.test");
  const request = new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body,
  });

  if (url.pathname === "/api/questions") return getQuestions(request);
  if (url.pathname === "/api/answers") return postAnswer(request);
  if (url.pathname === "/api/answers/batch") return postBatchAnswers(request);
  return Response.json({ error: "unexpected test request" }, { status: 500 });
}
