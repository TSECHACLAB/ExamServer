"use client";

import { useEffect, useState } from "react";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import { DadsUtilityLink } from "@/components/dads/DadsLink";
import { ChipLabel } from "@/vendor/dads-runtime/components/ChipLabel";
import {
  Disclosure,
  DisclosureSummary,
} from "@/vendor/dads-runtime/components/Disclosure";
import { Divider } from "@/vendor/dads-runtime/components/Divider";
import FlowBackLink from "@/components/FlowBackLink";
import { loadProgress } from "@/lib/storage";
import type {
  CategoryGroup,
  CategoryProgress,
  QuestionStyle,
  StudyProgress,
} from "@/types/exam";

export type CategoryBucket = "certification" | "other";

interface CategoryWithCount {
  defaultStyle: QuestionStyle;
  description: string;
  group: CategoryGroup;
  id: string;
  name: string;
  passingScore: number;
  questionCount: number;
  timeLimit: number;
}

interface Props {
  bucket: CategoryBucket | null;
  categories: CategoryWithCount[];
}

const GROUP_ORDER: Record<CategoryGroup, number> = {
  certification: 0,
  lab: 1,
  demo: 2,
};

export default function CategorySelector({ categories, bucket }: Props) {
  if (!bucket) return <BucketChoices categories={categories} />;

  const visibleCategories = sortCategoriesForSelection(
    categories.filter((category) => categoryMatchesBucket(category, bucket)),
  );

  return <CategoryList bucket={bucket} categories={visibleCategories} />;
}

function CategoryList({
  bucket,
  categories,
}: {
  bucket: CategoryBucket;
  categories: CategoryWithCount[];
}) {
  const [progress, setProgress] = useState<StudyProgress>({});

  useEffect(() => {
    queueMicrotask(() => setProgress(loadProgress()));
  }, []);

  return (
    <div className="max-w-4xl">
      <FlowBackLink href="/" label="演習の種類に戻る" />

      {categories.length === 0 ? (
        <DadsStatusBanner title="表示できる演習がありません" type="info2">
          別の演習の種類を選んでください。
        </DadsStatusBanner>
      ) : (
        <ul aria-label="演習カテゴリ" className="mt-8">
          {categories.map((category, index) => (
            <li key={category.id}>
              {index > 0 ? <Divider color="gray-420" className="my-7" /> : null}
              <CategoryRow
                category={category}
                bucket={bucket}
                progress={progress[category.id] ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BucketChoices({ categories }: { categories: CategoryWithCount[] }) {
  const choices: Array<{
    bucket: CategoryBucket;
    description: string;
    title: string;
  }> = [
    {
      bucket: "certification",
      title: "資格試験",
      description: "資格・公的試験の問題を解く",
    },
    {
      bucket: "other",
      title: "それ以外",
      description: "基礎確認やデモの問題を解く",
    },
  ];

  return (
    <ul aria-label="演習の種類" className="max-w-3xl">
      {choices.map((choice, index) => {
        const entries = categories.filter((category) =>
          categoryMatchesBucket(category, choice.bucket),
        );
        const questionCount = entries.reduce(
          (total, category) => total + category.questionCount,
          0,
        );

        return (
          <li key={choice.bucket}>
            {index > 0 ? <Divider color="gray-420" className="my-7" /> : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <DadsUtilityLink
                  href={`/?bucket=${choice.bucket}`}
                  className="inline-flex min-h-11 items-center text-std-24B-150"
                >
                  {choice.title}
                  <span aria-hidden="true" className="ml-2">
                    →
                  </span>
                </DadsUtilityLink>
                <p className="mt-1 text-std-16N-170 text-solid-gray-700">
                  {choice.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <ChipLabel color="gray" variant="outlined">
                  {entries.length}カテゴリ
                </ChipLabel>
                <ChipLabel color="blue" variant="filled-1">
                  {questionCount}問
                </ChipLabel>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryRow({
  bucket,
  category,
  progress,
}: {
  bucket: CategoryBucket;
  category: CategoryWithCount;
  progress: CategoryProgress | null;
}) {
  const ready = category.questionCount > 0;
  const setupHref = `/exam/${category.id}?bucket=${bucket}`;

  return (
    <section aria-labelledby={`category-${category.id}`}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          {ready ? (
            <DadsUtilityLink
              href={setupHref}
              className="inline-block min-h-11 py-2 text-std-20B-150"
            >
              <span id={`category-${category.id}`}>{category.name}</span>
              <span aria-hidden="true" className="ml-2">
                →
              </span>
            </DadsUtilityLink>
          ) : (
            <h2
              id={`category-${category.id}`}
              className="py-2 text-std-20B-150 text-solid-gray-600"
            >
              {category.name}
            </h2>
          )}
        </div>

        <div className="flex flex-wrap gap-2 sm:max-w-md sm:justify-end">
          <ChipLabel color={ready ? "blue" : "yellow"} variant="filled-1">
            {ready ? `${category.questionCount}問` : "準備中"}
          </ChipLabel>
          <ChipLabel color="gray" variant="outlined">
            {styleLabel(category.defaultStyle)}
          </ChipLabel>
          <ChipLabel color="gray" variant="outlined">
            標準{Math.floor(category.timeLimit / 60)}分
          </ChipLabel>
          <ChipLabel color="green" variant="outlined">
            合格基準 {category.passingScore}%
          </ChipLabel>
        </div>
      </div>

      <Disclosure className="mt-3">
        <DisclosureSummary className="font-bold text-solid-gray-800">
          概要を見る
        </DisclosureSummary>
        <div className="ml-8 mt-3 max-w-[65ch] space-y-4 text-std-16N-170 text-solid-gray-700">
          <p>{category.description}</p>
          {!ready ? (
            <DadsStatusBanner title="現在は開始できません" type="warning">
              問題が登録されると、この一覧から設定へ進めます。
            </DadsStatusBanner>
          ) : null}
          {progress ? <ProgressSummary progress={progress} /> : null}
        </div>
      </Disclosure>
    </section>
  );
}

function ProgressSummary({ progress }: { progress: CategoryProgress }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 border-l-4 border-key-900 pl-4 sm:grid-cols-3">
      <ProgressItem label="最高得点" value={`${progress.bestScore}%`} />
      <ProgressItem label="挑戦" value={`${progress.attempts}回`} />
      <ProgressItem
        label="解答履歴"
        value={`${Object.keys(progress.questionHistory).length}問`}
      />
    </dl>
  );
}

function ProgressItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-solid-gray-700">{label}</dt>
      <dd className="font-bold text-solid-gray-900">{value}</dd>
    </div>
  );
}

function sortCategoriesForSelection(
  categories: CategoryWithCount[],
): CategoryWithCount[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort((left, right) => {
      const groupDiff =
        GROUP_ORDER[left.category.group] - GROUP_ORDER[right.category.group];
      if (groupDiff !== 0) return groupDiff;

      const readyDiff =
        Number(right.category.questionCount > 0) -
        Number(left.category.questionCount > 0);
      return readyDiff !== 0 ? readyDiff : left.index - right.index;
    })
    .map(({ category }) => category);
}

function categoryMatchesBucket(
  category: CategoryWithCount,
  bucket: CategoryBucket,
): boolean {
  return bucket === "certification"
    ? category.group === "certification"
    : category.group !== "certification";
}

function styleLabel(style: QuestionStyle): string {
  return style === "scenario" ? "長文形式" : "一問形式";
}
