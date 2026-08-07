"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CategoryBucket } from "@/components/CategorySelector";
import { DadsButton } from "@/components/dads/DadsButton";
import { Checkbox } from "@/vendor/dads-runtime/components/Checkbox";
import {
  Disclosure,
  DisclosureSummary,
} from "@/vendor/dads-runtime/components/Disclosure";
import { Divider } from "@/vendor/dads-runtime/components/Divider";
import { Input } from "@/vendor/dads-runtime/components/Input";
import { Radio } from "@/vendor/dads-runtime/components/Radio";
import { countUniqueQuestionsForDomains } from "@/lib/question-domains";
import type { ExamMode } from "@/types/exam";

interface Props {
  categoryId: string;
  categoryName: string;
  domainOptions: string[];
  domainQuestionCounts: Record<string, number>;
  domainQuestionIds: Record<string, string[]>;
  passingScore: number;
  returnBucket: CategoryBucket;
  timeLimit: number;
  totalQuestions: number;
}

export default function ExamSetupForm({
  categoryId,
  categoryName,
  domainOptions,
  domainQuestionCounts,
  domainQuestionIds,
  passingScore,
  returnBucket,
  timeLimit,
  totalQuestions,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ExamMode>("exam");
  const [useAllQuestions, setUseAllQuestions] = useState(true);
  const [questionCount, setQuestionCount] = useState(Math.min(10, totalQuestions));
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [randomEnabled, setRandomEnabled] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  const availableQuestionCount =
    selectedDomains.length === 0
      ? totalQuestions
      : countUniqueQuestionsForDomains(domainQuestionIds, selectedDomains);
  const customQuestionCount = Math.min(
    questionCount,
    Math.max(1, availableQuestionCount),
  );
  const selectedCount = useAllQuestions
    ? availableQuestionCount
    : customQuestionCount;
  const canStart = selectedCount >= 1 && selectedCount <= availableQuestionCount;
  const usesTimer = mode === "exam" && timerEnabled;

  function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStart) return;

    sessionStorage.removeItem("exam-session-state");
    const params = new URLSearchParams({
      mode,
      count: String(selectedCount),
      timer: usesTimer ? "1" : "0",
      random: randomEnabled ? "1" : "0",
      bucket: returnBucket,
    });
    if (selectedDomains.length > 0) {
      params.set("domains", selectedDomains.join(","));
    }
    router.push(`/exam/${categoryId}/session?${params.toString()}`);
  }

  return (
    <form className="max-w-3xl space-y-8" onSubmit={handleStart}>
      <fieldset>
        <legend className="text-std-20B-150 text-solid-gray-900">解き方</legend>
        <p className="mt-1 text-std-16N-170 text-solid-gray-700">
          採点するタイミングを選びます。
        </p>
        <div className="mt-3 grid gap-2">
          <Radio
            name="mode"
            value="exam"
            checked={mode === "exam"}
            onChange={() => setMode("exam")}
            size="md"
          >
            <span>
              <span className="block font-bold">試験モード</span>
              <span className="block text-solid-gray-700">
                最後に回答状況を確認してから、まとめて採点します。
              </span>
            </span>
          </Radio>
          <Radio
            name="mode"
            value="drill"
            checked={mode === "drill"}
            onChange={() => setMode("drill")}
            size="md"
          >
            <span>
              <span className="block font-bold">一問一答</span>
              <span className="block text-solid-gray-700">
                1問ごとに正誤と解説を確認します。制限時間はありません。
              </span>
            </span>
          </Radio>
        </div>
      </fieldset>

      <Divider color="gray-420" />

      <fieldset>
        <legend className="text-std-20B-150 text-solid-gray-900">問題数</legend>
        <p className="mt-1 text-std-16N-170 text-solid-gray-700">
          現在の出題範囲には{availableQuestionCount}問あります。
        </p>
        <div className="mt-3 grid gap-2">
          <Radio
            name="questionCount"
            checked={useAllQuestions}
            onChange={() => setUseAllQuestions(true)}
            size="md"
          >
            全{availableQuestionCount}問
          </Radio>
          <div className="flex flex-wrap items-center gap-3">
            <Radio
              name="questionCount"
              checked={!useAllQuestions}
              onChange={() => setUseAllQuestions(false)}
              size="md"
            >
              問題数を指定
            </Radio>
            <label htmlFor="practice-question-count" className="sr-only">
              出題する問題数
            </label>
            <Input
              id="practice-question-count"
              type="number"
              min={1}
              max={Math.max(1, availableQuestionCount)}
              value={customQuestionCount}
              onChange={(event) =>
                setQuestionCount(
                  Math.max(
                    1,
                    Math.min(availableQuestionCount, Number(event.target.value)),
                  ),
                )
              }
              onFocus={() => setUseAllQuestions(false)}
              disabled={useAllQuestions}
              blockSize="md"
              className="w-24"
            />
            <span>問</span>
          </div>
        </div>
      </fieldset>

      {mode === "exam" ? (
        <>
          <Divider color="gray-420" />
          <fieldset>
            <legend className="text-std-20B-150 text-solid-gray-900">
              制限時間
            </legend>
            <Checkbox
              checked={timerEnabled}
              onChange={(event) => setTimerEnabled(event.target.checked)}
              size="md"
            >
              制限時間を使う（{Math.floor(timeLimit / 60)}分）
            </Checkbox>
            <p className="mt-1 text-std-16N-170 text-solid-gray-700">
              時間切れになると、その時点の回答で一度だけ自動採点します。
            </p>
          </fieldset>
        </>
      ) : null}

      <Divider color="gray-420" />

      <Disclosure>
        <DisclosureSummary className="text-std-16B-170 text-solid-gray-900">
          出題範囲と順番
        </DisclosureSummary>
        <div className="ml-8 mt-4 space-y-6">
          {domainOptions.length > 0 ? (
            <DomainOptions
              domains={domainOptions}
              domainQuestionCounts={domainQuestionCounts}
              selectedDomains={selectedDomains}
              onChange={setSelectedDomains}
            />
          ) : null}
          <Checkbox
            checked={randomEnabled}
            onChange={(event) => setRandomEnabled(event.target.checked)}
            size="md"
          >
            問題をランダムな順番にする
          </Checkbox>
        </div>
      </Disclosure>

      <Divider color="gray-420" />

      <section aria-labelledby="start-summary-title">
        <h2 id="start-summary-title" className="text-std-20B-150 text-solid-gray-900">
          開始条件
        </h2>
        <dl className="mt-3 grid max-w-2xl gap-x-8 gap-y-3 border-l-4 border-key-900 pl-4 sm:grid-cols-2">
          <SummaryItem label="解き方" value={mode === "exam" ? "試験モード" : "一問一答"} />
          <SummaryItem label="問題数" value={`${selectedCount}問`} />
          <SummaryItem
            label="制限時間"
            value={usesTimer ? `${Math.floor(timeLimit / 60)}分` : "なし"}
          />
          <SummaryItem
            label="出題順"
            value={randomEnabled ? "ランダム" : "登録順"}
          />
          <SummaryItem
            label="出題範囲"
            value={selectedDomains.length > 0 ? `${selectedDomains.length}範囲` : "全範囲"}
          />
          <SummaryItem label="合格基準" value={`${passingScore}%`} />
        </dl>
        <DadsButton
          type="submit"
          size="lg"
          variant="solid-fill"
          aria-disabled={!canStart}
          className="mt-6 w-full sm:w-fit"
        >
          {categoryName}を開始する
        </DadsButton>
      </section>
    </form>
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
        : [...selectedDomains, domain],
    );
  };

  return (
    <fieldset>
      <legend className="font-bold text-solid-gray-900">出題範囲</legend>
      <p className="mt-1 text-std-16N-170 text-solid-gray-700">
        選ばない場合は全範囲から出題します。
      </p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {domains.map((domain) => (
          <Checkbox
            key={domain}
            checked={selectedDomains.includes(domain)}
            onChange={() => toggleDomain(domain)}
            size="md"
          >
            {domain}（{domainQuestionCounts[domain] ?? 0}問）
          </Checkbox>
        ))}
      </div>
    </fieldset>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-solid-gray-700">{label}</dt>
      <dd className="font-bold text-solid-gray-900">{value}</dd>
    </div>
  );
}
