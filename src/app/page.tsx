import { getAllQuestions, getCategories } from "@/lib/questions";
import CategorySelector, { type CategoryBucket } from "@/components/CategorySelector";
import PublicAppShell from "@/components/layout/PublicAppShell";

/**
 * トップページ
 * 目的別にカテゴリを選択し、試験の概要と出題範囲を表示する。
 */
interface Props {
  searchParams?: Promise<{ bucket?: string | string[] }>;
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const bucket = normalizeBucket(params?.bucket);
  const categories = getCategories().map((category) => {
    return {
      id: category.id,
      name: category.name,
      defaultStyle: category.defaultStyle,
      description: category.description,
      group: category.group,
      passingScore: category.passingScore,
      timeLimit: category.timeLimit,
      questionCount: getAllQuestions(category.id).length,
    };
  });

  return (
    <PublicAppShell
      activeSection="exam"
      eyebrow="演習"
      title={bucket ? bucketTitle(bucket) : "演習を選ぶ"}
      description={
        bucket
          ? "タイトルから設定へ進みます。概要は必要なものだけ開いて確認します。"
          : "まずは演習の種類を選びます。"
      }
    >
      <CategorySelector categories={categories} bucket={bucket} />
    </PublicAppShell>
  );
}

function normalizeBucket(value?: string | string[]): CategoryBucket | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "certification" || raw === "other") return raw;
  return null;
}

function bucketTitle(bucket: CategoryBucket): string {
  return bucket === "certification" ? "資格試験" : "それ以外";
}
