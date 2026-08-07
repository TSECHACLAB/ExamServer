// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  EXAM_SESSION_STORAGE_KEY,
  loadSessionStateV2,
  saveSessionStateV2,
} from "@/lib/exam-session-storage";
import type { SessionStateV2 } from "@/types/exam";

const validState: SessionStateV2 = {
  version: 2,
  attemptId: "attempt-1",
  configFingerprint: "fingerprint-1",
  categoryId: "general",
  mode: "exam",
  questionIds: ["general-001"],
  answers: [
    {
      questionId: "general-001",
      selectedAnswer: null,
      flagged: false,
      uncertain: false,
    },
  ],
  currentIndex: 0,
  deadlineAt: 1_800_000,
  phase: "active",
  drillResults: {},
  completedResult: null,
};

beforeEach(() => sessionStorage.clear());

describe("SessionStateV2", () => {
  it("同じ設定fingerprintの整合した状態だけを復元する", () => {
    saveSessionStateV2(validState);

    expect(loadSessionStateV2("fingerprint-1")).toEqual(validState);
  });

  it("設定が変わった保存状態を破棄する", () => {
    saveSessionStateV2(validState);

    expect(loadSessionStateV2("different-fingerprint")).toBeNull();
    expect(sessionStorage.getItem(EXAM_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("問題順と回答が一致しない破損状態を破棄する", () => {
    sessionStorage.setItem(
      EXAM_SESSION_STORAGE_KEY,
      JSON.stringify({
        ...validState,
        answers: [{ ...validState.answers[0], questionId: "other-001" }],
      }),
    );

    expect(loadSessionStateV2("fingerprint-1")).toBeNull();
    expect(sessionStorage.getItem(EXAM_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("送信途中は回答可能な直前状態へ戻す", () => {
    saveSessionStateV2({ ...validState, phase: "submitting" });

    expect(loadSessionStateV2("fingerprint-1")?.phase).toBe("active");
  });

  it("モードと矛盾するphaseや完了結果を復元しない", () => {
    sessionStorage.setItem(
      EXAM_SESSION_STORAGE_KEY,
      JSON.stringify({ ...validState, phase: "feedback" }),
    );
    expect(loadSessionStateV2("fingerprint-1")).toBeNull();

    sessionStorage.setItem(
      EXAM_SESSION_STORAGE_KEY,
      JSON.stringify({ ...validState, phase: "finished", completedResult: null }),
    );
    expect(loadSessionStateV2("fingerprint-1")).toBeNull();
  });
});
