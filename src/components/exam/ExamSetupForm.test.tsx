// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExamSetupForm from "@/components/exam/ExamSetupForm";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

beforeEach(() => {
  routerPush.mockReset();
  sessionStorage.clear();
});

afterEach(cleanup);

describe("ExamSetupForm", () => {
  it("絞込み後の表示件数と実際に開始する件数を一致させる", () => {
    render(
      <ExamSetupForm
        categoryId="sg"
        categoryName="情報セキュリティマネジメント"
        totalQuestions={10}
        timeLimit={7200}
        passingScore={60}
        returnBucket="certification"
        domainOptions={["年度A", "年度B"]}
        domainQuestionCounts={{ 年度A: 4, 年度B: 6 }}
        domainQuestionIds={{
          年度A: ["a1", "a2", "a3", "a4"],
          年度B: ["b1", "b2", "b3", "b4", "b5", "b6"],
        }}
      />,
    );

    const conditionSummary = screen
      .getByText("出題範囲と順番")
      .closest("summary");
    fireEvent.click(conditionSummary!);
    fireEvent.click(screen.getByRole("radio", { name: "問題数を指定" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "年度A（4問）" }));

    expect(
      screen.getByText("現在の出題範囲には4問あります。"),
    ).toBeInTheDocument();
    expect(screen.getByText("4問", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "情報セキュリティマネジメントを開始する",
      }),
    );

    expect(routerPush).toHaveBeenCalledOnce();
    const destination = routerPush.mock.calls[0][0] as string;
    expect(destination).toContain("count=4");
    expect(destination).toContain("domains=%E5%B9%B4%E5%BA%A6A");
  });

  it("一問一答ではタイマー設定を表示せずtimer=0で開始する", () => {
    render(
      <ExamSetupForm
        categoryId="general"
        categoryName="一般常識"
        totalQuestions={5}
        timeLimit={1800}
        passingScore={60}
        returnBucket="other"
        domainOptions={[]}
        domainQuestionCounts={{}}
        domainQuestionIds={{}}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "制限時間を使う（30分）" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^一問一答/ }));
    expect(
      screen.queryByRole("checkbox", { name: /制限時間を使う/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("なし", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "一般常識を開始する" }),
    );

    const destination = routerPush.mock.calls[0][0] as string;
    expect(destination).toContain("mode=drill");
    expect(destination).toContain("timer=0");
  });
});
