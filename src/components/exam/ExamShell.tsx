"use client";

import { useRef, useState, type ReactNode } from "react";
import BugReportButton from "@/components/bug-report/BugReportButton";
import { DadsButton } from "@/components/dads/DadsButton";
import { useModalDialog } from "@/components/dads/client";
import QuestionNav from "@/components/exam/QuestionNav";
import {
  ModalDialog,
  ModalDialogBody,
  ModalDialogClose,
  ModalDialogContent,
  ModalDialogHeader,
  ModalDialogHeading,
} from "@/vendor/dads-runtime/components/ModalDialog/ModalDialog";
import {
  ProgressIndicator,
  ProgressIndicatorLinear,
} from "@/vendor/dads-runtime/components/ProgressIndicator/ProgressIndicator";
import { isAnswered } from "@/lib/answer-state";
import type { AnswerState, ExamMode } from "@/types/exam";

interface Props {
  categoryName: string;
  mode: ExamMode;
  currentIndex: number;
  totalCount: number;
  answers: AnswerState[];
  remainingTime: number | null;
  isFlagged: boolean;
  isUncertain: boolean;
  isScenario?: boolean;
  isLocked?: boolean;
  showingFeedback?: boolean;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onFlag: () => void;
  onUncertain: () => void;
  onPrev: () => void;
  onPrimary: () => void;
  onNavigate: (index: number) => void;
  onReview: () => void;
  onExit: () => void;
  children: ReactNode;
}

export default function ExamShell({
  categoryName,
  mode,
  currentIndex,
  totalCount,
  answers,
  remainingTime,
  isFlagged,
  isUncertain,
  isScenario = false,
  isLocked = false,
  showingFeedback = false,
  primaryLabel,
  primaryDisabled = false,
  onFlag,
  onUncertain,
  onPrev,
  onPrimary,
  onNavigate,
  onReview,
  onExit,
  children,
}: Props) {
  const answeredCount = answers.filter((answer) => isAnswered(answer.selectedAnswer)).length;
  const flaggedCount = answers.filter((answer) => answer.flagged).length;
  const uncertainCount = answers.filter((answer) => answer.uncertain).length;
  const answeredProgress = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  const navigationLocked = isLocked || showingFeedback;
  const shellWidth = isScenario ? "max-w-[96rem]" : "max-w-[88rem]";

  return (
    <div className="practice-dads-surface flex h-svh min-h-svh flex-col overflow-hidden bg-[var(--background)]">
      <header className="z-20 shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className={`mx-auto ${shellWidth}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-solid-gray-900">{categoryName}</p>
              <p className="mt-1 text-std-16N-170 text-solid-gray-700">
                現在位置：問{currentIndex + 1} / {totalCount}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <BugReportButton variant="exam" />
              {mode === "exam" ? (
                <DadsButton
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={onReview}
                  disabled={isLocked}
                >
                  終了前確認
                </DadsButton>
              ) : (
                <DadsButton
                  type="button"
                  size="xs"
                  variant="text"
                  onClick={onExit}
                  disabled={isLocked}
                >
                  演習を中断
                </DadsButton>
              )}
              {remainingTime !== null ? (
                <time
                  className="min-h-11 rounded-6 border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-2 font-mono font-bold tabular-nums text-solid-gray-900"
                  aria-label={`残り時間 ${formatTimeForSpeech(remainingTime)}`}
                >
                  残り {formatTime(remainingTime)}
                </time>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_auto] sm:items-center">
            <ProgressIndicator
              type="inlined"
              value={answeredProgress}
              aria-label={`回答済み ${answeredCount}問、全${totalCount}問`}
              className="!justify-start"
            >
              <ProgressIndicatorLinear className="w-full max-w-xl" />
              <span className="whitespace-nowrap font-bold">
                回答済み {answeredCount} / {totalCount}
              </span>
            </ProgressIndicator>
            <p className="text-sm text-solid-gray-700">
              分からない {uncertainCount}問・見直し {flaggedCount}問
            </p>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
        <div
          className={`mx-auto grid gap-6 px-4 py-6 sm:px-6 ${shellWidth} ${
            isScenario
              ? "lg:grid-cols-[15rem_minmax(0,1fr)]"
              : "lg:grid-cols-[14rem_minmax(0,1fr)]"
          }`}
        >
          <aside className="hidden lg:block" aria-label="問題一覧">
            <div className="sticky top-6 rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="text-std-20B-150 text-solid-gray-900">問題一覧</h2>
              <p className="mt-1 text-sm text-solid-gray-700">
                済・未・？・旗の文字でも状態を示します。
              </p>
              <div className="mt-4">
                <QuestionNav
                  answers={answers}
                  currentIndex={currentIndex}
                  onNavigate={onNavigate}
                  disabled={navigationLocked}
                />
              </div>
            </div>
          </aside>
          <section className="min-w-0 pb-2">{children}</section>
        </div>
      </main>

      <footer className="z-20 shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className={`mx-auto grid gap-3 ${shellWidth}`}>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <DadsButton
                type="button"
                size="sm"
                variant="outline"
                onClick={onPrev}
                disabled={currentIndex === 0 || navigationLocked}
              >
                前へ
              </DadsButton>
              <MobileQuestionNav
                answers={answers}
                currentIndex={currentIndex}
                onNavigate={onNavigate}
                disabled={navigationLocked}
              />
            </div>
            <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:col-span-1">
              <DadsButton
                type="button"
                size="sm"
                variant={isFlagged ? "solid-fill" : "outline"}
                aria-pressed={isFlagged}
                onClick={onFlag}
                disabled={navigationLocked}
              >
                ⚑ 見直し
              </DadsButton>
              <DadsButton
                type="button"
                size="sm"
                variant={isUncertain ? "solid-fill" : "outline"}
                aria-pressed={isUncertain}
                onClick={onUncertain}
                disabled={navigationLocked}
              >
                ？ 分からない
              </DadsButton>
              <DadsButton
                type="button"
                size="sm"
                variant="solid-fill"
                onClick={onPrimary}
                disabled={isLocked || primaryDisabled}
              >
                {primaryLabel}
              </DadsButton>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MobileQuestionNav({
  answers,
  currentIndex,
  onNavigate,
  disabled,
}: {
  answers: AnswerState[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modal = useModalDialog({
    open,
    onOpenChange: (nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) window.setTimeout(() => triggerRef.current?.focus(), 0);
    },
  });
  const close = () => modal.closeButtonProps.onClick();

  return (
    <>
      <DadsButton
        ref={triggerRef}
        type="button"
        size="sm"
        variant="outline"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
      >
        問題一覧
      </DadsButton>
      <ModalDialog
        {...modal.dialogProps}
        className="practice-dads-surface z-50"
        scroll="inner"
        width="min(38rem, calc(100vw - 2rem))"
      >
        <ModalDialogContent>
          <ModalDialogHeader>
            <ModalDialogHeading {...modal.headingProps}>問題一覧</ModalDialogHeading>
            <ModalDialogClose {...modal.closeButtonProps} />
          </ModalDialogHeader>
          <ModalDialogBody className="pt-3">
            <p className="mb-4 text-solid-gray-700">
              移動する問題を選んでください。済・未・？・旗で回答状態を示します。
            </p>
            <QuestionNav
              answers={answers}
              currentIndex={currentIndex}
              onNavigate={(index) => {
                onNavigate(index);
                close();
              }}
            />
          </ModalDialogBody>
        </ModalDialogContent>
      </ModalDialog>
    </>
  );
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatTimeForSpeech(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}
