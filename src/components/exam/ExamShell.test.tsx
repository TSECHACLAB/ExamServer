// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExamShell from "@/components/exam/ExamShell";
import QuestionNav from "@/components/exam/QuestionNav";
import type { AnswerState } from "@/types/exam";

const answers: AnswerState[] = [
  {
    questionId: "q1",
    selectedAnswer: null,
    flagged: false,
    dontKnow: true,
  },
  {
    questionId: "q2",
    selectedAnswer: 1,
    flagged: true,
    dontKnow: false,
  },
];

afterEach(() => {
  cleanup();
});

describe("ExamShell", () => {
  it("shows and calls the unknown answer action", () => {
    const onDontKnow = vi.fn();

    render(
      <ExamShell
        categoryName="Java Silver"
        currentIndex={0}
        totalCount={2}
        answers={answers}
        remainingTime={null}
        isFlagged={false}
        isDontKnow
        onFlag={vi.fn()}
        onDontKnow={onDontKnow}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onNavigate={vi.fn()}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      >
        <p>問題本文</p>
      </ExamShell>
    );

    const unknownButton = screen.getByRole("button", {
      name: "分からない",
    });

    expect(unknownButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/分からない 1問/)).toBeInTheDocument();

    fireEvent.click(unknownButton);

    expect(onDontKnow).toHaveBeenCalledTimes(1);
  });
});

describe("QuestionNav", () => {
  it("marks unknown answers with a question mark", () => {
    render(
      <QuestionNav
        answers={answers}
        currentIndex={0}
        onNavigate={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "問1 分からない" })
    ).toHaveAttribute("title", "問1 (分からない)");
  });
});
