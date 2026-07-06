/**
 * 試験画面の外枠
 * ヘッダー（カテゴリ名・問番号・タイマー）、本体エリア、フッター（ナビ）を提供する。
 */

"use client";

import { ReactNode } from "react";
import BugReportButton from "@/components/bug-report/BugReportButton";
import type { AnswerState } from "@/types/exam";
import QuestionNav from "@/components/exam/QuestionNav";

interface Props {
  categoryName: string;
  currentIndex: number;
  totalCount: number;
  answers: AnswerState[];
  /** タイマー表示（nullの場合は非表示） */
  remainingTime: number | null;
  isFlagged: boolean;
  isDontKnow: boolean;
  /** シナリオ問題の場合 true — 本体エリアを広く取る */
  isScenario?: boolean;
  onFlag: () => void;
  onDontKnow: () => void;
  onPrev: () => void;
  onNext: () => void;
  onNavigate: (index: number) => void;
  onFinish: () => void;
  onExit: () => void;
  children: ReactNode;
}

export default function ExamShell({
  categoryName,
  currentIndex,
  totalCount,
  answers,
  remainingTime,
  isFlagged,
  isDontKnow,
  isScenario = false,
  onFlag,
  onDontKnow,
  onPrev,
  onNext,
  onNavigate,
  onFinish,
  onExit,
  children,
}: Props) {
  const answeredCount = answers.filter(
    (answer) => answer.selectedAnswer !== null
  ).length;
  const flaggedCount = answers.filter((answer) => answer.flagged).length;
  const dontKnowCount = answers.filter((answer) => answer.dontKnow).length;
  const progress = Math.round(((currentIndex + 1) / totalCount) * 100);
  const shellWidth = isScenario ? "max-w-7xl" : "max-w-[88rem]";

  return (
    <div className="exam-production-surface flex h-[100svh] min-h-[100svh] flex-col overflow-hidden bg-gray-50 lg:h-[100dvh] lg:min-h-[100dvh]">
      <header className="z-30 shrink-0 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className={`mx-auto ${shellWidth}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-950">
                {categoryName}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                問{currentIndex + 1}/{totalCount} ・ 解答済み {answeredCount}
                問 ・ 分からない {dontKnowCount}問 ・ フラグ {flaggedCount}件
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <BugReportButton variant="exam" />

              <button
                onClick={onExit}
                className="min-h-10 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                試験終了
              </button>

              <button
                onClick={onFlag}
                className={`min-h-10 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isFlagged
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-amber-700"
                }`}
                title="フラグを切り替え"
                aria-pressed={isFlagged}
              >
                ⚑
              </button>

              {remainingTime !== null && (
                <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm font-semibold tabular-nums text-gray-800">
                  {formatTime(remainingTime)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-blue-600 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={`mx-auto grid gap-5 px-4 py-6 ${
            isScenario
              ? "max-w-7xl pb-32 lg:grid-cols-[14rem_minmax(0,1fr)] lg:pb-6"
              : "max-w-[88rem] pb-32 lg:grid-cols-[13rem_minmax(0,1fr)] lg:pb-6"
          }`}
        >
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-950">問題一覧</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                青は解答済み、？は分からない、旗は見直し対象です。
              </p>
              <div className="mt-3">
                <QuestionNav
                  answers={answers}
                  currentIndex={currentIndex}
                  onNavigate={onNavigate}
                />
              </div>
            </div>
          </aside>

          <section className="min-w-0">{children}</section>
        </div>
      </main>

      <footer
        className="z-30 shrink-0 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className={`mx-auto flex max-h-[42svh] min-h-0 flex-col gap-3 lg:max-h-none ${shellWidth}`}>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <button
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="min-h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:px-4"
            >
              前へ
            </button>

            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={onDontKnow}
                aria-pressed={isDontKnow}
                className={`min-h-10 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:px-4 ${
                  isDontKnow
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                分からない
              </button>

              {currentIndex < totalCount - 1 ? (
                <button
                  onClick={onNext}
                  className="min-h-10 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:px-5"
                >
                  次へ
                </button>
              ) : (
                <button
                  onClick={onFinish}
                  className="min-h-10 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 sm:px-5"
                >
                  終了
                </button>
              )}
            </div>
          </div>

          <details className="min-h-0 lg:hidden">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
              <span>問題一覧</span>
              <span className="font-mono text-xs tabular-nums text-gray-500">
                問{currentIndex + 1}/{totalCount}
              </span>
            </summary>
            <div className="mt-2 max-h-32 overflow-y-auto overscroll-contain rounded-md border border-gray-200 bg-white p-2 pr-1 sm:max-h-40">
              <QuestionNav
                answers={answers}
                currentIndex={currentIndex}
                onNavigate={onNavigate}
              />
            </div>
          </details>
        </div>
      </footer>
    </div>
  );
}

/** 秒数を MM:SS 形式に変換 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
