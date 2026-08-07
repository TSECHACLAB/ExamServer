"use client";

import { useEffect } from "react";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_LOCATIONS,
  BUG_REPORT_SEVERITIES,
  type BugReportCategory,
  type BugReportLocation,
} from "@/lib/bug-report";
import { DadsButton } from "@/components/dads/DadsButton";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import { useModalDialog } from "@/components/dads/client";
import { Link } from "@/vendor/dads-runtime/components/Link";
import {
  ModalDialog,
  ModalDialogActions,
  ModalDialogBody,
  ModalDialogClose,
  ModalDialogContent,
  ModalDialogHeader,
  ModalDialogHeading,
  ModalDialogScrollArea,
} from "@/vendor/dads-runtime/components/ModalDialog/ModalDialog";
import { Radio } from "@/vendor/dads-runtime/components/Radio";
import { Select } from "@/vendor/dads-runtime/components/Select";
import { Textarea } from "@/vendor/dads-runtime/components/Textarea";
import { useBugReportForm } from "./useBugReportForm";

interface DadsBugReportDialogProps {
  id: string;
  initialWhere: BugReportLocation;
  onClose: () => void;
  open: boolean;
}

export default function DadsBugReportDialog({
  id,
  initialWhere,
  onClose,
  open,
}: DadsBugReportDialogProps) {
  const form = useBugReportForm(initialWhere);
  const { reset } = form;
  const modal = useModalDialog({
    open,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  useEffect(() => {
    if (open) reset(initialWhere);
  }, [initialWhere, open, reset]);

  return (
    <ModalDialog
      {...modal.dialogProps}
      id={id}
      className="practice-dads-surface z-[100]"
      scroll="inner"
      width="min(36rem, calc(100vw - 2rem))"
    >
      <ModalDialogContent>
        <form className="contents" onSubmit={form.handleSubmit}>
          <ModalDialogHeader>
            <div className="min-w-0 grow">
              <ModalDialogHeading {...modal.headingProps}>不具合報告</ModalDialogHeading>
              <p className="mt-1 text-std-16N-170 text-solid-gray-700">
                分かる範囲だけ選んで送れます。
              </p>
            </div>
            <ModalDialogClose {...modal.closeButtonProps} />
          </ModalDialogHeader>

          <ModalDialogScrollArea>
            <ModalDialogBody className="space-y-6 pt-4">
              {form.submitState.status === "success" ? (
                <DadsStatusBanner title="報告しました" type="success" live="polite">
                  <p>確認用のIssueを作成しました。</p>
                  <Link href={form.submitState.issueUrl} target="_blank" rel="noreferrer">
                    作成されたIssueを開く
                  </Link>
                </DadsStatusBanner>
              ) : (
                <>
                  <label className="grid gap-2 font-bold text-solid-gray-800">
                    何が起きましたか？
                    <Select
                      value={form.category}
                      onChange={(event) =>
                        form.setCategory(event.target.value as BugReportCategory)
                      }
                    >
                      {BUG_REPORT_CATEGORIES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="grid gap-2 font-bold text-solid-gray-800">
                    どこで起きましたか？
                    <Select
                      value={form.where}
                      onChange={(event) =>
                        form.setWhere(event.target.value as BugReportLocation)
                      }
                    >
                      {BUG_REPORT_LOCATIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <fieldset>
                    <legend className="font-bold text-solid-gray-800">
                      どれくらい困りますか？
                    </legend>
                    <div className="mt-2 grid gap-1">
                      {BUG_REPORT_SEVERITIES.map((option) => (
                        <Radio
                          key={option}
                          name="severity"
                          value={option}
                          checked={form.severity === option}
                          onChange={() => form.setSeverity(option)}
                          size="md"
                        >
                          {option}
                        </Radio>
                      ))}
                    </div>
                  </fieldset>

                  <label className="grid gap-2 font-bold text-solid-gray-800">
                    補足
                    <span className="font-normal text-solid-gray-700">
                      何を押したか、どの問題かなど。空でも送れます。
                    </span>
                    <Textarea
                      value={form.detail}
                      onChange={(event) => form.setDetail(event.target.value)}
                      maxLength={1000}
                      rows={5}
                      className="w-full resize-y"
                    />
                    <span className="text-right font-normal text-solid-gray-700">
                      {form.detail.length}/1000
                    </span>
                  </label>

                  <label className="hidden">
                    会社名
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.hp}
                      onChange={(event) => form.setHp(event.target.value)}
                    />
                  </label>

                  {form.submitState.status === "error" ? (
                    <DadsStatusBanner
                      title="送信できませんでした"
                      type="error"
                      live="assertive"
                    >
                      {form.submitState.message}
                    </DadsStatusBanner>
                  ) : null}
                </>
              )}
            </ModalDialogBody>
          </ModalDialogScrollArea>

          <ModalDialogActions className="flex flex-wrap justify-end gap-3 border-t border-solid-gray-200 pt-4">
            <DadsButton
              type="button"
              size="md"
              variant="outline"
              onClick={modal.closeButtonProps.onClick}
            >
              閉じる
            </DadsButton>
            {form.submitState.status !== "success" ? (
              <DadsButton
                type="submit"
                size="md"
                variant="solid-fill"
                aria-disabled={form.submitState.status === "submitting"}
              >
                {form.submitState.status === "submitting" ? "送信中" : "報告する"}
              </DadsButton>
            ) : null}
          </ModalDialogActions>
        </form>
      </ModalDialogContent>
    </ModalDialog>
  );
}
