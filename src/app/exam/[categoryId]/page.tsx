/**
 * 試験設定画面
 * モード選択（本番/一問一答）、問題数、タイマーON/OFFを設定して試験を開始する。
 */

import { notFound } from "next/navigation";
import { getCategoryById, getAllQuestions } from "@/lib/questions";
import ExamSetupForm from "@/components/exam/ExamSetupForm";
import FlowBackLink from "@/components/FlowBackLink";
import PublicAppShell from "@/components/layout/PublicAppShell";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import type { CategoryBucket } from "@/components/CategorySelector";
import { getQuestionDomains } from "@/lib/question-domains";

interface Props {
  params: Promise<{ categoryId: string }>;
  searchParams?: Promise<{ bucket?: string | string[] }>;
}

export default async function ExamSetupPage({ params, searchParams }: Props) {
  const { categoryId } = await params;
  const query = await searchParams;
  const category = getCategoryById(categoryId);
  if (!category) notFound();

  const questions = getAllQuestions(categoryId);
  const totalQuestions = questions.length;
  const bucket = normalizeBucket(query?.bucket) ?? bucketFromGroup(category.group);
  const domainQuestionIds = questions.reduce<Record<string, string[]>>(
    (ids, question) => {
      for (const domain of getQuestionDomains(question)) {
        ids[domain] = [...(ids[domain] ?? []), question.id];
      }
      return ids;
    },
    {}
  );
  const domainQuestionCounts = Object.fromEntries(
    Object.entries(domainQuestionIds).map(([domain, ids]) => [domain, ids.length])
  );
  const domainOptions = Object.keys(domainQuestionCounts).sort();

  return (
    <PublicAppShell
      activeSection="exam"
      eyebrow="演習設定"
      title={category.name}
      description={category.description}
    >
      <section className="max-w-3xl">
        <FlowBackLink href={`/?bucket=${bucket}`} label="カテゴリ一覧に戻る" />
        {totalQuestions === 0 ? (
          <DadsStatusBanner title="まだ問題が登録されていません" type="warning">
            このカテゴリは準備中です。カテゴリ一覧から別の演習を選んでください。
          </DadsStatusBanner>
        ) : (
          <ExamSetupForm
            categoryId={category.id}
            categoryName={category.name}
            totalQuestions={totalQuestions}
            timeLimit={category.timeLimit}
            passingScore={category.passingScore}
            returnBucket={bucket}
            domainOptions={domainOptions}
            domainQuestionCounts={domainQuestionCounts}
            domainQuestionIds={domainQuestionIds}
          />
        )}
      </section>
    </PublicAppShell>
  );
}

function normalizeBucket(value?: string | string[]): CategoryBucket | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "certification" || raw === "other") return raw;
  return null;
}

function bucketFromGroup(group: string): CategoryBucket {
  return group === "certification" ? "certification" : "other";
}
