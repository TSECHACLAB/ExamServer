// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CategorySelector from "./CategorySelector";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: PropsWithChildren<ComponentProps<"a">>) => <a {...props}>{children}</a>,
}));

const categories = [
  {
    id: "ready",
    name: "準備済み試験",
    description: "実データから取得した説明です。",
    group: "certification" as const,
    defaultStyle: "oneshot" as const,
    timeLimit: 1800,
    questionCount: 12,
    passingScore: 60,
  },
  {
    id: "empty",
    name: "準備中試験",
    description: "準備中の説明です。",
    group: "certification" as const,
    defaultStyle: "scenario" as const,
    timeLimit: 5400,
    questionCount: 0,
    passingScore: 65,
  },
];

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("CategorySelector", () => {
  it("演習の種類を実カテゴリ数と実問題数で示す", () => {
    render(<CategorySelector categories={categories} bucket={null} />);

    expect(screen.getByRole("link", { name: /資格試験/ })).toHaveAttribute(
      "href",
      "/?bucket=certification",
    );
    expect(screen.getByText("2カテゴリ")).toBeInTheDocument();
    expect(screen.getByText("12問")).toBeInTheDocument();
  });

  it("開始可否、合格基準、概要を文字で区別する", () => {
    render(<CategorySelector categories={categories} bucket="certification" />);

    expect(screen.getByRole("link", { name: /準備済み試験/ })).toHaveAttribute(
      "href",
      "/exam/ready?bucket=certification",
    );
    expect(screen.queryByRole("link", { name: /準備中試験/ })).not.toBeInTheDocument();
    expect(screen.getByText("準備中")).toBeInTheDocument();
    expect(screen.getByText("合格基準 60%")).toBeInTheDocument();
    expect(screen.getByText("合格基準 65%")).toBeInTheDocument();
    expect(screen.getAllByText("概要を見る")).toHaveLength(2);
  });
});
