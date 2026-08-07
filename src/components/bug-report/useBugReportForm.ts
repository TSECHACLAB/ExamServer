"use client";

import { useCallback, useState, type FormEvent } from "react";
import {
  BUG_REPORT_CATEGORIES,
  type BugReportCategory,
  type BugReportLocation,
  type BugReportSeverity,
} from "@/lib/bug-report";

export type BugReportSubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; issueUrl: string }
  | { status: "error"; message: string };

const COOLDOWN_KEY = "examserver:last-bug-report-at";
const COOLDOWN_MS = 60_000;

export function useBugReportForm(initialWhere: BugReportLocation) {
  const [category, setCategory] = useState<BugReportCategory>(BUG_REPORT_CATEGORIES[0]);
  const [severity, setSeverity] = useState<BugReportSeverity>("少し困る");
  const [where, setWhere] = useState<BugReportLocation>(initialWhere);
  const [detail, setDetail] = useState("");
  const [hp, setHp] = useState("");
  const [submitState, setSubmitState] = useState<BugReportSubmitState>({ status: "idle" });

  const reset = useCallback((nextWhere: BugReportLocation) => {
    setCategory(BUG_REPORT_CATEGORIES[0]);
    setSeverity("少し困る");
    setWhere(nextWhere);
    setDetail("");
    setHp("");
    setSubmitState({ status: "idle" });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const lastReportAt = Number(localStorage.getItem(COOLDOWN_KEY) || "0");
    if (Date.now() - lastReportAt < COOLDOWN_MS) {
      setSubmitState({
        status: "error",
        message: "連続送信を抑制しています。少し待ってから送信してください。",
      });
      return;
    }

    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          severity,
          where,
          detail,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          reportedAt: new Date().toISOString(),
          hp,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        issueUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.issueUrl) {
        throw new Error(data.error || "送信できませんでした");
      }

      localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      setSubmitState({ status: "success", issueUrl: data.issueUrl });
    } catch (error: unknown) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "送信できませんでした",
      });
    }
  }

  return {
    category,
    detail,
    handleSubmit,
    hp,
    reset,
    setCategory,
    setDetail,
    setHp,
    setSeverity,
    setWhere,
    severity,
    submitState,
    where,
  };
}
