import { DadsButton } from "@/components/dads/DadsButton";
import { DadsLink } from "@/components/dads/DadsLink";
import { DadsLoading, DadsStatusBanner } from "@/components/dads/DadsStatus";
import { Heading, HeadingTitle } from "@/vendor/dads-runtime/components/Heading";
import type { ExamSessionError } from "@/types/exam";

interface Props {
  categoryName: string;
  error?: ExamSessionError | null;
  loadingLabel?: string;
  onRetry?: () => void;
  setupHref: string;
}

export default function ExamSessionStatus({
  categoryName,
  error,
  loadingLabel,
  onRetry,
  setupHref,
}: Props) {
  return (
    <main className="practice-dads-surface min-h-svh bg-[var(--background)] px-4 py-10 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 font-bold text-solid-gray-700">{categoryName}</p>
        <Heading size="36">
          <HeadingTitle level="h1">{error ? errorTitle(error) : loadingLabel ?? "読み込み中"}</HeadingTitle>
        </Heading>

        {error ? (
          <div className="mt-8">
            <DadsStatusBanner
              title={error.kind === "empty" ? "出題できる問題がありません" : "処理を完了できませんでした"}
              type={error.kind === "empty" ? "warning" : "error"}
              live="assertive"
            >
              <p>{error.message}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {onRetry ? (
                  <DadsButton type="button" size="md" variant="solid-fill" onClick={onRetry}>
                    直前の操作を再試行
                  </DadsButton>
                ) : null}
                <DadsLink href={setupHref}>設定画面に戻る</DadsLink>
              </div>
            </DadsStatusBanner>
          </div>
        ) : (
          <div className="mt-10">
            <DadsLoading label={loadingLabel ?? "問題を読み込んでいます"} />
          </div>
        )}
      </div>
    </main>
  );
}

function errorTitle(error: ExamSessionError): string {
  if (error.kind === "empty") return "問題がありません";
  if (error.operation === "load") return "問題を読み込めませんでした";
  if (error.operation === "drill") return "答え合わせが止まりました";
  return "採点が止まりました";
}
