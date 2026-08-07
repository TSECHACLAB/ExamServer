"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { DadsButton } from "@/components/dads/DadsButton";
import DadsBugReportDialog from "./DadsBugReportDialog";
import { useBugReportForm } from "./useBugReportForm";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_LOCATIONS,
  BUG_REPORT_SEVERITIES,
  inferBugReportLocation,
  type BugReportCategory,
  type BugReportLocation,
} from "@/lib/bug-report";

interface BugReportButtonProps {
  variant?: "public" | "practice" | "exam";
}

export default function BugReportButton({
  variant = "public",
}: BugReportButtonProps) {
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [initialWhere, setInitialWhere] = useState<BugReportLocation>("不明");
  const openDialog = () => {
    setInitialWhere(inferBugReportLocation(window.location.pathname));
    setOpen(true);
  };
  const label = (
    <>
      <span className="sm:hidden">報告</span>
      <span className="hidden sm:inline">不具合報告</span>
    </>
  );

  return (
    <>
      {variant === "public" ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls={open ? dialogId : undefined}
          onClick={openDialog}
          className={buttonClassName()}
        >
          {label}
        </button>
      ) : (
        <DadsButton
          type="button"
          size="xs"
          variant="text"
          aria-haspopup="dialog"
          aria-controls={open ? dialogId : undefined}
          onClick={openDialog}
          className="shrink-0"
        >
          {label}
        </DadsButton>
      )}

      {variant === "public" ? (
        open ? (
          <BugReportPortal>
            <BugReportDialog
              id={dialogId}
              initialWhere={initialWhere}
              onClose={() => setOpen(false)}
            />
          </BugReportPortal>
        ) : null
      ) : (
        <DadsBugReportDialog
          id={dialogId}
          initialWhere={initialWhere}
          onClose={() => setOpen(false)}
          open={open}
        />
      )}
    </>
  );
}

function BugReportPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function BugReportDialog({
  id,
  initialWhere,
  onClose,
}: {
  id: string;
  initialWhere: BugReportLocation;
  onClose: () => void;
}) {
  const titleId = `${id}-title`;
  const {
    category,
    detail,
    handleSubmit,
    hp,
    setCategory,
    setDetail,
    setHp,
    setSeverity,
    setWhere,
    severity,
    submitState,
    where,
  } = useBugReportForm(initialWhere);

  return (
    <div
      data-bug-report-overlay="true"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gray-950/20 px-4 py-4 backdrop-blur-[1px] sm:justify-end sm:px-6 sm:py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-xl sm:max-h-[calc(100dvh-4rem)]"
      >
        <div className="shrink-0 border-b border-gray-100 p-4 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-base font-bold">
                不具合報告
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                分かる範囲だけ選んで送れます。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              閉じる
            </button>
          </div>
        </div>

        {submitState.status === "success" ? (
          <div className="m-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm leading-6 text-green-900">
            <p className="font-semibold">報告しました。</p>
            <a
              href={submitState.issueUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-semibold text-green-800 underline underline-offset-2"
            >
              作成されたIssueを開く
            </a>
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">
                  何が起きましたか？
                </span>
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as BugReportCategory)
                  }
                  className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {BUG_REPORT_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-800">
                  どこで起きましたか？
                </span>
                <select
                  value={where}
                  onChange={(event) =>
                    setWhere(event.target.value as BugReportLocation)
                  }
                  className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {BUG_REPORT_LOCATIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className="text-sm font-semibold text-gray-800">
                  どれくらい困りますか？
                </legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {BUG_REPORT_SEVERITIES.map((option) => (
                    <label
                      key={option}
                      className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm font-semibold transition-colors ${
                        severity === option
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="severity"
                        value={option}
                        checked={severity === option}
                        onChange={() => setSeverity(option)}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="text-sm font-semibold text-gray-800">
                  補足
                </span>
                <textarea
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="何を押したか、どの問題かなど。空でも送れます。"
                  className="mt-1 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-6 text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <span className="mt-1 block text-right text-xs text-gray-500">
                  {detail.length}/1000
                </span>
              </label>

              <label className="hidden">
                会社名
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={hp}
                  onChange={(event) => setHp(event.target.value)}
                />
              </label>

              {submitState.status === "error" && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {submitState.message}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitState.status === "submitting"}
                className="min-h-10 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                {submitState.status === "submitting"
                  ? "送信中"
                  : "報告する"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function buttonClassName(): string {
  return "min-h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]";
}
