"use client";

import { DadsButton } from "@/components/dads/DadsButton";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import QuestionNav from "@/components/exam/QuestionNav";
import { Heading, HeadingTitle } from "@/vendor/dads-runtime/components/Heading";
import { Divider } from "@/vendor/dads-runtime/components/Divider";
import { isAnswered } from "@/lib/answer-state";
import type { AnswerState } from "@/types/exam";

interface Props {
  answers: AnswerState[];
  categoryName: string;
  currentIndex: number;
  passingScore: number;
  remainingTime: number | null;
  isLocked?: boolean;
  onReturn: (index?: number) => void;
  onSubmit: () => void;
}

export default function ExamReview({
  answers,
  categoryName,
  currentIndex,
  passingScore,
  remainingTime,
  isLocked = false,
  onReturn,
  onSubmit,
}: Props) {
  const answered = answers.filter((answer) => isAnswered(answer.selectedAnswer)).length;
  const uncertain = answers.filter((answer) => answer.uncertain).length;
  const flagged = answers.filter((answer) => answer.flagged).length;
  const unanswered = answers.length - answered;

  return (
    <main className="practice-dads-surface min-h-svh bg-[var(--background)] px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 font-bold text-solid-gray-700">{categoryName}</p>
        <Heading size="36">
          <HeadingTitle level="h1">回答状況を確認</HeadingTitle>
        </Heading>
        <p className="mt-3 max-w-3xl text-std-16N-170 text-solid-gray-700">
          まだ採点は確定していません。未回答や見直し対象を確認し、準備ができたら「採点する」を押してください。
        </p>

        {remainingTime !== null ? (
          <p className="mt-4 border-l-4 border-key-900 pl-4 font-mono font-bold tabular-nums">
            残り時間 {formatTime(remainingTime)}
          </p>
        ) : null}

        <dl className="mt-8 grid gap-3 sm:grid-cols-4">
          <ReviewCount label="回答済み" value={answered} symbol="済" />
          <ReviewCount label="未回答" value={unanswered} symbol="未" />
          <ReviewCount label="分からない" value={uncertain} symbol="？" />
          <ReviewCount label="見直し対象" value={flagged} symbol="旗" />
        </dl>

        {unanswered > 0 ? (
          <div className="mt-6">
            <DadsStatusBanner title={`未回答が${unanswered}問あります`} type="warning">
              未回答は0点として採点されます。問題一覧から戻って回答できます。
            </DadsStatusBanner>
          </div>
        ) : (
          <div className="mt-6">
            <DadsStatusBanner title="すべての問題に回答しています" type="success">
              見直し対象がある場合は、採点前に確認してください。
            </DadsStatusBanner>
          </div>
        )}

        <Divider color="gray-420" className="my-8" />

        <section aria-labelledby="review-question-list">
          <h2 id="review-question-list" className="text-std-24B-150 text-solid-gray-900">
            問題ごとの状態
          </h2>
          <p className="mt-2 text-solid-gray-700">
            問題を選ぶと、その問題へ戻ります。色だけでなく、済・未・？・旗で状態を示します。
          </p>
          <div className="mt-5 max-w-3xl">
            <QuestionNav
              answers={answers}
              currentIndex={currentIndex}
              onNavigate={(index) => onReturn(index)}
              disabled={isLocked}
            />
          </div>
        </section>

        <Divider color="gray-420" className="my-8" />

        <section aria-labelledby="grading-confirmation" className="max-w-3xl">
          <h2 id="grading-confirmation" className="text-std-24B-150 text-solid-gray-900">
            採点を確定する
          </h2>
          <p className="mt-2 text-solid-gray-700">
            合格基準は{passingScore}%です。採点後はこの受験の回答を変更できません。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <DadsButton
              type="button"
              size="lg"
              variant="solid-fill"
              onClick={onSubmit}
              disabled={isLocked}
            >
              採点する
            </DadsButton>
            <DadsButton
              type="button"
              size="lg"
              variant="outline"
              onClick={() => onReturn()}
              disabled={isLocked}
            >
              回答に戻る
            </DadsButton>
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewCount({
  label,
  value,
  symbol,
}: {
  label: string;
  value: number;
  symbol: string;
}) {
  return (
    <div className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-solid-gray-700">{symbol} {label}</dt>
      <dd className="mt-1 text-std-28B-150 text-solid-gray-900">{value}問</dd>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
