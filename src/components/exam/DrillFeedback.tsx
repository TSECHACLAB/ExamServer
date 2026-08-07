/**
 * 一問一答モードのフィードバック
 * 回答後に正誤と解説を表示する。
 */

import type {
  AnswerResponse,
  QuestionSourcePublisher,
  PublicQuestionSourceReference,
  PublicQuestionSourceSet,
} from "@/types/exam";
import MarkdownContent from "@/components/exam/MarkdownContent";
import QuestionSourceCitation from "@/components/exam/QuestionSourceCitation";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";

interface Props {
  result: AnswerResponse;
  sourceReference?: PublicQuestionSourceReference;
  additionalSourceReferences?: PublicQuestionSourceReference[];
  source?: PublicQuestionSourceSet;
  sourceMap?: Record<string, PublicQuestionSourceSet>;
  publisher?: QuestionSourcePublisher | null;
}

export default function DrillFeedback({
  result,
  sourceReference,
  additionalSourceReferences,
  source,
  sourceMap,
  publisher,
}: Props) {
  const title = result.correct
    ? "○ 正解"
    : result.score > 0
      ? `△ 部分正解（${Math.round(result.score * 100)}%）`
      : "× 不正解";
  return (
    <section aria-labelledby="drill-feedback-heading" className="mt-6 space-y-5">
      <div id="drill-feedback-heading">
        <DadsStatusBanner
          title={title}
          type={result.correct ? "success" : result.score > 0 ? "warning" : "error"}
          live="polite"
        >
          回答結果と解説を確認してから、画面下の操作で次へ進んでください。
        </DadsStatusBanner>
      </div>

      {/* 解説 */}
      <div className="rounded-8 border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <h2 className="mb-3 text-std-20B-150 text-solid-gray-900">解説</h2>
        <MarkdownContent className="text-[var(--foreground)]">
          {result.explanation}
        </MarkdownContent>
      </div>

      <QuestionSourceCitation
        reference={sourceReference}
        source={source}
        additionalReferences={additionalSourceReferences}
        sourceMap={sourceMap}
        publisher={publisher}
      />
    </section>
  );
}
