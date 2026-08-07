// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import BugReportButton from "@/components/bug-report/BugReportButton";

const fetchMock = vi.fn();
const dialogInvokers = new WeakMap<HTMLDialogElement, HTMLElement>();

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) dialogInvokers.set(this, active);
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      dialogInvokers.get(this)?.focus();
    },
  });
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      issueUrl: "https://github.com/TakesSecHacLab-team/ExamServer/issues/123",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BugReportButton", () => {
  it("opens the form and submits selected fields without required free text", async () => {
    render(<BugReportButton />);

    fireEvent.click(screen.getByRole("button", { name: /報告/ }));

    expect(
      screen.getByRole("dialog", { name: "不具合報告" })
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("dialog", { name: "不具合報告" })
        .closest("[data-bug-report-overlay]")
        ?.parentElement
    ).toBe(document.body);
    expect(screen.getByLabelText("何が起きましたか？")).toHaveValue(
      "表示が崩れる"
    );
    expect(screen.getByLabelText("どこで起きましたか？")).toHaveValue(
      "演習選択"
    );

    fireEvent.change(screen.getByLabelText("何が起きましたか？"), {
      target: { value: "操作できない" },
    });
    fireEvent.click(screen.getByLabelText("困る"));
    fireEvent.click(screen.getByRole("button", { name: "報告する" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bug-reports",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual(
      expect.objectContaining({
        category: "操作できない",
        severity: "困る",
        where: "演習選択",
        detail: "",
      })
    );
    expect(screen.getByText("報告しました。")).toBeInTheDocument();
  });

  it("DADS版モーダルで初期フォーカス、Esc、呼出元への復帰を扱う", async () => {
    render(<BugReportButton variant="practice" />);

    const trigger = screen.getByRole("button", { name: /報告/ });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "不具合報告" });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "不具合報告" })).toHaveFocus();
    });
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByLabelText("何が起きましたか？")).toHaveValue("表示が崩れる");

    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));

    await waitFor(() => {
      expect(dialog).not.toHaveAttribute("open");
      expect(trigger).toHaveFocus();
    });
  });
});
