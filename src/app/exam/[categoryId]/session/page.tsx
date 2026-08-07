import { notFound } from "next/navigation";
import ExamSession from "@/components/exam/ExamSession";
import FlowBackLink from "@/components/FlowBackLink";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import { Heading, HeadingTitle } from "@/vendor/dads-runtime/components/Heading";
import {
  normalizeExamSessionConfig,
  type ExamSessionSearchParams,
} from "@/lib/exam-session-config";
import {
  getAllQuestions,
  getCategoryById,
  toPublicQuestion,
} from "@/lib/questions";

interface Props {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<ExamSessionSearchParams>;
}

/** カテゴリとURL契約はServer Component境界で確定してからクライアントへ渡す。 */
export default async function SessionPage({ params, searchParams }: Props) {
  const [{ categoryId }, query] = await Promise.all([params, searchParams]);
  const category = getCategoryById(categoryId);
  if (!category) notFound();

  const publicQuestions = getAllQuestions(categoryId).map(toPublicQuestion);
  const normalized = normalizeExamSessionConfig(category, publicQuestions, query);
  const setupHref = `/exam/${categoryId}?bucket=${
    normalized.ok ? normalized.config.returnBucket : normalized.returnBucket
  }`;

  if (!normalized.ok) {
    return (
      <main className="practice-dads-surface min-h-svh px-4 py-10 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Heading size="36">
            <HeadingTitle level="h1">開始条件を確認できませんでした</HeadingTitle>
          </Heading>
          <div className="mt-8">
            <DadsStatusBanner
              title="URLの受験設定が正しくありません"
              type="error"
              live="assertive"
            >
              <ul className="list-disc space-y-1 pl-6">
                {normalized.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </DadsStatusBanner>
          </div>
          <div className="mt-8">
            <FlowBackLink href={setupHref} label="設定画面に戻る" />
          </div>
        </div>
      </main>
    );
  }

  return <ExamSession category={category} config={normalized.config} />;
}
