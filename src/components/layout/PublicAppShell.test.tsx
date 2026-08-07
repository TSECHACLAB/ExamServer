// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicAppShell from "./PublicAppShell";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: PropsWithChildren<ComponentProps<"a">>) => (
    <a data-next-link="true" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./ThemeSelector", () => ({
  default: () => <button type="button">テーマ</button>,
}));

vi.mock("@/components/bug-report/BugReportButton", () => ({
  default: () => <button type="button">不具合を報告</button>,
}));

afterEach(() => {
  cleanup();
});

describe("PublicAppShell practical-lab navigation", () => {
  it("uses full document navigation for the separately deployed lab", () => {
    render(
      <PublicAppShell activeSection="exam" title="演習">
        <p>演習本文</p>
      </PublicAppShell>,
    );

    const labLinks = screen.getAllByRole("link", { name: /実践ラボ/ });
    expect(labLinks).toHaveLength(1);
    for (const link of labLinks) {
      expect(link).toHaveAttribute("href", "/lab");
      expect(link).not.toHaveAttribute("data-next-link");
      expect(link).not.toHaveAttribute("aria-current");
    }

    const examLinks = screen.getAllByRole("link", { name: /演習/ });
    expect(examLinks).toHaveLength(1);
    for (const link of examLinks) {
      expect(link).toHaveAttribute("data-next-link", "true");
      expect(link).toHaveAttribute("aria-current", "page");
    }
  });
});
