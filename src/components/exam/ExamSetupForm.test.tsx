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
        returnBucket="certification"
        domainOptions={["年度A", "年度B"]}
        domainQuestionCounts={{ 年度A: 4, 年度B: 6 }}
        domainQuestionIds={{
          年度A: ["a1", "a2", "a3", "a4"],
          年度B: ["b1", "b2", "b3", "b4", "b5", "b6"],
        }}
      />,
    );

    const conditionSummary = screen.getByText("出題条件").closest("summary");
    fireEvent.click(conditionSummary!);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    fireEvent.click(
      screen.getByText((_, element) =>
        element?.tagName === "SPAN" && element.textContent === "年度A（4問）"
      ),
    );

    expect(screen.getByText("対象は全4問です。")).toBeInTheDocument();
    expect(conditionSummary).toHaveTextContent("4問");
    expect(
      screen.getByText("試験モードで4問を開始します。"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "情報セキュリティマネジメント を開始",
      }),
    );

    expect(routerPush).toHaveBeenCalledOnce();
    const destination = routerPush.mock.calls[0][0] as string;
    expect(destination).toContain("count=4");
    expect(destination).toContain("domains=%E5%B9%B4%E5%BA%A6A");
  });
});
