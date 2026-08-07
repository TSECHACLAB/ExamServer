/**
 * 一問一答モードのフィードバック
 * 回答後に正誤と解説を表示する。
 */

"use client";

import type {
  AnswerResponse,
  QuestionSourcePublisher,
  PublicQuestionSourceReference,
  PublicQuestionSourceSet,
} from "@/types/exam";
import MarkdownContent from "@/components/exam/MarkdownContent";
import QuestionSourceCitation from "@/components/exam/QuestionSourceCitation";

interface Props {
  result: AnswerResponse;
  sourceReference?: PublicQuestionSourceReference;
  additionalSourceReferences?: PublicQuestionSourceReference[];
  source?: PublicQuestionSourceSet;
  sourceMap?: Record<string, PublicQuestionSourceSet>;
  publisher?: QuestionSourcePublisher | null;
  onNext: () => void;
}

export default function DrillFeedback({
  result,
  sourceReference,
  additionalSourceReferences,
  source,
  sourceMap,
  publisher,
  onNext,
}: Props) {
  return (
    <div className="mt-6 space-y-4">
      {/* 正誤表示 */}
      <div
        className={`p-4 rounded-lg border-2 ${
          result.correct
            ? "border-green-300 bg-green-50"
            : result.score > 0
              ? "border-amber-300 bg-amber-50"
              : "border-red-300 bg-red-50"
        }`}
      >
        <p className="font-semibold text-sm">
          {result.correct
            ? "○ 正解！"
            : result.score > 0
              ? `△ 部分正解（${Math.round(result.score * 100)}%）`
              : "× 不正解"}
        </p>
      </div>

      {/* 解説 */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 mb-2">解説</p>
        <MarkdownContent className="text-gray-700">
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

      {/* 次の問題へ */}
      <button
        onClick={onNext}
        className="rounded-lg bg-blue-600 px-6 py-2 text-sm text-white transition-colors hover:bg-blue-700"
      >
        次の問題へ
      </button>
    </div>
  );
}
