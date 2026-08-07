/**
 * 長文シナリオレイアウト
 *
 * PC: 左にシナリオ本文（スクロール可）/ 右に問題・選択肢 の左右分割。
 * スマホ: シナリオ本文を折りたたみ表示 / 下に問題・選択肢。
 */

"use client";

import { useState } from "react";
import type { PublicQuestion, PublicScenario, QuestionType } from "@/types/exam";
import ChoiceGroup from "@/components/exam/ChoiceGroup";
import MarkdownContent from "@/components/exam/MarkdownContent";

interface Props {
  scenario: PublicScenario;
  question: PublicQuestion;
  selectedAnswer: number | number[] | null;
  onAnswer: (answer: number | number[]) => void;
  showResult?: {
    correctAnswer: number | number[];
    userAnswer: number | number[] | null;
  };
  disabled?: boolean;
}

export default function ScenarioLayout({
  scenario,
  question,
  selectedAnswer,
  onAnswer,
  showResult,
  disabled,
}: Props) {
  const [scenarioOpen, setScenarioOpen] = useState(false);

  return (
    <>
      {/* ── PC: 左右分割 ── */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-6 md:h-[calc(100vh-12rem)]">
        {/* 左: シナリオ本文 */}
        <div className="overflow-auto border border-gray-200 rounded-lg bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">
            {scenario.title}
          </h3>
          <MarkdownContent className="text-gray-800">
            {scenario.scenario}
          </MarkdownContent>

          {/* シナリオ画像 */}
          {scenario.scenarioImages?.map((src) => (
            <div key={src} className="mt-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="シナリオ画像"
                className="max-w-full rounded border border-gray-200"
              />
            </div>
          ))}
        </div>

        {/* 右: 問題・選択肢 */}
        <div className="overflow-auto">
          <QuestionPanel
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswer={onAnswer}
            showResult={showResult}
            disabled={disabled}
          />
        </div>
      </div>

      {/* ── スマホ: 折りたたみ + 縦積み ── */}
      <div className="md:hidden space-y-4">
        {/* 折りたたみシナリオ */}
        <button
          type="button"
          onClick={() => setScenarioOpen(!scenarioOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <span>{scenarioOpen ? "▲" : "▼"} {scenario.title}</span>
        </button>

        {scenarioOpen && (
          <div className="border border-gray-200 rounded-lg bg-white p-4 max-h-[50vh] overflow-auto">
            <MarkdownContent className="text-gray-800">
              {scenario.scenario}
            </MarkdownContent>
            {scenario.scenarioImages?.map((src) => (
              <div key={src} className="mt-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt="シナリオ画像"
                  className="max-w-full rounded border border-gray-200"
                />
              </div>
            ))}
          </div>
        )}

        {/* 問題・選択肢 */}
        <QuestionPanel
          question={question}
          selectedAnswer={selectedAnswer}
          onAnswer={onAnswer}
          showResult={showResult}
          disabled={disabled}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 問題パネル（PC / スマホ共用）
// ---------------------------------------------------------------------------

function QuestionPanel({
  question,
  selectedAnswer,
  onAnswer,
  showResult,
  disabled,
}: Omit<Props, "scenario">) {
  return (
    <div className="space-y-5">
      {/* 問題文 */}
      <MarkdownContent className="text-gray-800">
        {question.text}
      </MarkdownContent>

      {/* 問題画像 */}
      {question.image && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.image}
            alt="問題画像"
            className="max-w-full max-h-60 rounded border border-gray-200"
          />
        </div>
      )}

      {/* 選択肢 */}
      <ChoiceGroup
        options={question.options}
        type={question.type as QuestionType}
        selectionLimit={question.selectionLimit}
        selectedAnswer={selectedAnswer}
        onChange={onAnswer}
        showResult={showResult}
        disabled={disabled}
      />
    </div>
  );
}
