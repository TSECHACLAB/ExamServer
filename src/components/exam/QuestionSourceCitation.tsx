import type {
  QuestionSourcePublisher,
  PublicQuestionSourceReference,
  PublicQuestionSourceSet,
} from "@/types/exam";

interface Props {
  reference?: PublicQuestionSourceReference;
  source?: PublicQuestionSourceSet;
  additionalReferences?: PublicQuestionSourceReference[];
  sourceMap?: Record<string, PublicQuestionSourceSet>;
  publisher?: QuestionSourcePublisher | null;
}

export default function QuestionSourceCitation({
  reference,
  source,
  additionalReferences = [],
  sourceMap = {},
  publisher,
}: Props) {
  if (!reference || !source) return null;

  const label =
    source.kind === "official-past" ? "公式公開過去問" : "公式サンプル問題";
  const href = source.questionPdf?.url ?? source.officialPageUrl;
  const modificationNote =
    reference.modificationNote ?? source.defaultModificationNote;

  return (
    <aside className="rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
      <p>
        <span className="mr-2 inline-flex rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
          {label}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
        >
          {source.title} 問{reference.questionNumber}
        </a>
      </p>
      {publisher && <p className="mt-1">出典：{publisher.name}</p>}
      {additionalReferences.length > 0 && (
        <p className="mt-1">
          同一問題の出題履歴：
          {additionalReferences.map((occurrence, index) => {
            const occurrenceSource = sourceMap[occurrence.sourceId];
            if (!occurrenceSource) return null;
            const occurrenceHref =
              occurrenceSource.questionPdf?.url ?? occurrenceSource.officialPageUrl;
            return (
              <span key={`${occurrence.sourceId}-${occurrence.questionNumber}`}>
                {index > 0 ? "、" : ""}
                <a
                  href={occurrenceHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                >
                  {occurrenceSource.title} 問{occurrence.questionNumber}
                </a>
              </span>
            );
          })}
        </p>
      )}
      {reference.modified && modificationNote && (
        <p className="mt-1 text-slate-500">
          Web表示用に改変：{modificationNote}
        </p>
      )}
    </aside>
  );
}
