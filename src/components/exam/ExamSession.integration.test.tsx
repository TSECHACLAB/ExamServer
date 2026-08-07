// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getCategories } from "@/app/api/categories/route";
import { GET as getQuestions } from "@/app/api/questions/route";
import { POST as postAnswer } from "@/app/api/answers/route";
import { POST as postBatchAnswers } from "@/app/api/answers/batch/route";
import ExamSession from "@/components/exam/ExamSession";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

beforeEach(() => {
  routerPush.mockReset();
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal("fetch", routeFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("演習画面結合", () => {
  it("試験モードで回答を保持し、実APIで採点して結果を保存する", async () => {
    render(
      <ExamSession
        categoryId="general"
        mode="exam"
        questionCount={2}
        timerEnabled={false}
        randomEnabled={false}
        selectedDomains={[]}
        returnBucket="other"
      />
    );

    expect(
      await screen.findByText("日本の国花として広く親しまれている花はどれか？")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "桜" }));
    expect(screen.getByText(/解答済み 1問/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(
      await screen.findByText("水の化学式として正しいものはどれか？")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "H2O" }));
    fireEvent.click(screen.getByRole("button", { name: "終了" }));

    expect(
      await screen.findByText("一般常識(demo) 結果")
    ).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 問正解")).toBeInTheDocument();

    await waitFor(() => {
      const progress = JSON.parse(
        localStorage.getItem("exam-server-progress") ?? "{}"
      );
      expect(progress.general).toMatchObject({
        attempts: 1,
        bestScore: 100,
      });
      expect(Object.keys(progress.general.questionHistory)).toEqual([
        "general-001",
        "general-002",
      ]);
    });
    expect(sessionStorage.getItem("exam-session-state")).toBeNull();
  });

  it("一問一答で不正解と正解の即時フィードバックを順に表示する", async () => {
    render(
      <ExamSession
        categoryId="general"
        mode="drill"
        questionCount={2}
        timerEnabled={false}
        randomEnabled={false}
        selectedDomains={[]}
        returnBucket="other"
      />
    );

    expect(
      await screen.findByText("日本の国花として広く親しまれている花はどれか？")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "バラ" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(await screen.findByText("× 不正解")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次の問題へ" }));

    expect(
      await screen.findByText("水の化学式として正しいものはどれか？")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "H2O" }));
    fireEvent.click(screen.getByRole("button", { name: "終了" }));

    expect(await screen.findByText("○ 正解！")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次の問題へ" }));

    expect(
      await screen.findByText("全問完了しました！")
    ).toBeInTheDocument();
  });

  it("試験モードの回答と現在位置を再マウント後に復元する", async () => {
    const props = {
      categoryId: "general",
      mode: "exam" as const,
      questionCount: 2,
      timerEnabled: false,
      randomEnabled: false,
      selectedDomains: [],
      returnBucket: "other" as const,
    };
    const firstRender = render(<ExamSession {...props} />);

    expect(
      await screen.findByText("日本の国花として広く親しまれている花はどれか？")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "桜" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(
      await screen.findByText("水の化学式として正しいものはどれか？")
    ).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(
        sessionStorage.getItem("exam-session-state") ?? "{}"
      );
      expect(saved).toMatchObject({
        categoryId: "general",
        currentIndex: 1,
      });
      expect(saved.answers[0].selectedAnswer).toBe(1);
    });

    firstRender.unmount();
    render(<ExamSession {...props} />);

    expect(
      await screen.findByText("水の化学式として正しいものはどれか？")
    ).toBeInTheDocument();
    expect(screen.getByText(/解答済み 1問/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "前へ" }));
    expect(
      await screen.findByText("日本の国花として広く親しまれている花はどれか？")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "桜" })).toHaveClass(
      "bg-blue-50"
    );
  });

  it("一問一答で未回答を明示して正解と解説を確認できる", async () => {
    render(
      <ExamSession
        categoryId="general"
        mode="drill"
        questionCount={1}
        timerEnabled={false}
        randomEnabled={false}
        selectedDomains={[]}
        returnBucket="other"
      />
    );

    expect(
      await screen.findByText("日本の国花として広く親しまれている花はどれか？")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "分からない" }));

    expect(await screen.findByText("× 不正解")).toBeInTheDocument();
    expect(screen.getByText(/日本には法律で定められた国花はありません/)).toBeInTheDocument();
    expect(screen.getByText(/分からない 1問/)).toBeInTheDocument();
  });

  it("複数選択を全て外すと未回答へ戻る", async () => {
    render(
      <ExamSession
        categoryId="general"
        mode="exam"
        questionCount={3}
        timerEnabled={false}
        randomEnabled={false}
        selectedDomains={[]}
        returnBucket="other"
      />,
    );

    await screen.findByText("日本の国花として広く親しまれている花はどれか？");
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(
      await screen.findByText(/日本に隣接する海として正しいもの/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "日本海" }));
    expect(screen.getByText(/解答済み 1問/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "日本海" }));
    expect(screen.getByText(/解答済み 0問/)).toBeInTheDocument();
  });
});

async function routeFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(rawUrl, "https://example.test");
  const request = new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: init?.headers,
    body: init?.body,
  });

  if (url.pathname === "/api/categories") return getCategories(request);
  if (url.pathname === "/api/questions") return getQuestions(request);
  if (url.pathname === "/api/answers") return postAnswer(request);
  if (url.pathname === "/api/answers/batch") {
    return postBatchAnswers(request);
  }

  return Response.json({ error: "unexpected test request" }, { status: 500 });
}
