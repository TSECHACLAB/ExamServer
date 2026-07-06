/**
 * 試験設定フォーム
 * モード・出題条件を設定して受験を開始する。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamMode } from "@/types/exam";
import type { CategoryBucket } from "@/components/CategorySelector";

interface Props {
  categoryId: string;
  categoryName: string;
  totalQuestions: number;
  timeLimit: number;
  returnBucket: CategoryBucket;
  domainOptions: string[];
  domainQuestionCounts: Record<string, number>;
}

export default function ExamSetupForm({
  categoryId,
  categoryName,
  totalQuestions,
  timeLimit,
  returnBucket,
  domainOptions,
  domainQuestionCounts,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ExamMode>("exam");
  const [useAllQuestions, setUseAllQuestions] = useState(true);
  const [questionCount, setQuestionCount] = useState(
    Math.min(10, totalQuestions)
  );
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const availableQuestionCount =
    selectedDomains.length === 0
      ? totalQuestions
      : selectedDomains.reduce(
          (sum, domain) => sum + (domainQuestionCounts[domain] ?? 0),
          0
        );
  const customQuestionCount = Math.min(
    questionCount,
    Math.max(1, availableQuestionCount)
  );
  const selectedCount = useAllQuestions
    ? availableQuestionCount
    : customQuestionCount;
  const canStart =
    selectedCount >= 1 && selectedCount <= availableQuestionCount;

  const handleStart = () => {
    if (!canStart) return;

    localStorage.removeItem("exam-session-state");
    sessionStorage.removeItem("exam-session-state");
    const params = new URLSearchParams({
      mode,
      count: String(selectedCount),
      timer: timerEnabled ? "1" : "0",
      random: randomEnabled ? "1" : "0",
      bucket: returnBucket,
    });
    if (selectedDomains.length > 0) {
      params.set("domains", selectedDomains.join(","));
    }
    router.push(`/exam/${categoryId}/session?${params.toString()}`);
  };

  const countLabel = useAllQuestions ? "全問" : `${questionCount}問`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="space-y-6">
        <fieldset>
          <legend className="text-base font-bold text-gray-950">
            モード
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModeOption
              selected={mode === "exam"}
              onClick={() => setMode("exam")}
              title="試験モード"
              description="最後にまとめて採点します。"
            />
            <ModeOption
              selected={mode === "drill"}
              onClick={() => setMode("drill")}
              title="一問一答"
              description="1問ずつ答え合わせします。"
            />
          </div>
        </fieldset>

        <details className="group rounded-md border border-gray-200">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 bg-white px-4 py-3 text-sm font-semibold text-gray-950 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
            <span>出題条件</span>
            <span className="flex items-center gap-2 text-xs font-medium text-gray-500">
              {countLabel}
              {randomEnabled ? " / ランダム" : ""}
              <span
                aria-hidden="true"
                className="transition-transform group-open:rotate-180"
              >
                ↓
              </span>
            </span>
          </summary>

          <div className="space-y-5 border-t border-gray-200 px-4 py-4">
            <fieldset>
              <legend className="text-sm font-semibold text-gray-950">
                問題数
              </legend>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                対象は全{availableQuestionCount}問です。
              </p>
              <div className="mt-3 space-y-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50">
                  <input
                    type="radio"
                    name="questionCount"
                    checked={useAllQuestions}
                    onChange={() => setUseAllQuestions(true)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    全問
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50">
                  <input
                    type="radio"
                    name="questionCount"
                    checked={!useAllQuestions}
                    onChange={() => setUseAllQuestions(false)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    問題数を選ぶ
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={availableQuestionCount}
                    value={customQuestionCount}
                    onChange={(e) =>
                      setQuestionCount(
                        Math.max(
                          1,
                          Math.min(
                            availableQuestionCount,
                            Number(e.target.value)
                          )
                        )
                      )
                    }
                    disabled={useAllQuestions}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:opacity-60"
                  />
                  <span className="text-sm text-gray-700">問</span>
                </label>
              </div>
            </fieldset>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                checked={randomEnabled}
                onChange={(e) => setRandomEnabled(e.target.checked)}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">
                ランダムな順番で出題する
              </span>
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">
                制限時間あり（{Math.floor(timeLimit / 60)}分）
              </span>
            </label>

            {domainOptions.length > 0 && (
              <DomainOptions
                domains={domainOptions}
                domainQuestionCounts={domainQuestionCounts}
                selectedDomains={selectedDomains}
                onChange={setSelectedDomains}
              />
            )}
          </div>
        </details>

        <div className="border-t border-gray-200 pt-5">
          <p className="mb-3 text-sm leading-6 text-gray-600">
            {mode === "exam" ? "試験モード" : "一問一答"}で{selectedCount}
            問を開始します。
          </p>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto"
          >
            {categoryName} を開始
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-24 rounded-md border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
        selected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <span className="block text-sm font-semibold text-gray-900">
        {title}
      </span>
      <span className="mt-1 block text-xs leading-5 text-gray-500">
        {description}
      </span>
    </button>
  );
}

function DomainOptions({
  domains,
  domainQuestionCounts,
  selectedDomains,
  onChange,
}: {
  domains: string[];
  domainQuestionCounts: Record<string, number>;
  selectedDomains: string[];
  onChange: (domains: string[]) => void;
}) {
  const toggleDomain = (domain: string) => {
    onChange(
      selectedDomains.includes(domain)
        ? selectedDomains.filter((item) => item !== domain)
        : [...selectedDomains, domain]
    );
  };

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-950">
        ドメイン
      </legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {domains.map((domain) => (
          <label
            key={domain}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selectedDomains.includes(domain)}
              onChange={() => toggleDomain(domain)}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-700">
              {domain}（{domainQuestionCounts[domain] ?? 0}問）
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
