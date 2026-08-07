// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuestionSourceCitation from "@/components/exam/QuestionSourceCitation";
import type {
  QuestionSourcePublisher,
  QuestionSourceReference,
  QuestionSourceSet,
} from "@/types/exam";

const source: QuestionSourceSet = {
  id: "ipa-sg-2026-r08",
  kind: "official-past",
  title: "令和8年度 情報セキュリティマネジメント試験 公開問題",
  year: 2026,
  section: "科目A・B",
  publicationStatus: "published",
  exerciseStatus: "complete",
  officialPageUrl: "https://www.ipa.go.jp/example",
  publishedQuestionCount: 15,
  questionPdf: {
    url: "https://www.ipa.go.jp/example/questions.pdf",
    sha256: "0".repeat(64),
  },
  defaultModificationNote: "改行と表をWeb表示用に整形しています。",
};

const reference: QuestionSourceReference = {
  sourceId: source.id,
  questionNumber: "13",
  modified: true,
};

const publisher: QuestionSourcePublisher = {
  name: "独立行政法人情報処理推進機構（IPA）",
  reusePolicyUrl: "https://www.ipa.go.jp/shiken/faq.html",
};

afterEach(() => {
  cleanup();
});

describe("QuestionSourceCitation", () => {
  it("identifies official past questions and links the source PDF", () => {
    render(
      <QuestionSourceCitation
        reference={reference}
        source={source}
        publisher={publisher}
      />
    );

    expect(screen.getByText("公式公開過去問")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: `${source.title} 問13`,
      })
    ).toHaveAttribute("href", source.questionPdf?.url);
    expect(screen.getByText(`出典：${publisher.name}`)).toBeInTheDocument();
    expect(screen.getByText(/Web表示用に改変/)).toHaveTextContent(
      source.defaultModificationNote ?? ""
    );
  });

  it("renders nothing without a resolvable source", () => {
    const { container } = render(
      <QuestionSourceCitation reference={reference} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows every official occurrence after duplicate questions are merged", () => {
    const legacySource: QuestionSourceSet = {
      ...source,
      id: "ipa-sg-2019-autumn-am",
      title: "令和元年度秋期 情報セキュリティマネジメント試験 午前",
      year: 2019,
      section: "午前",
      publishedQuestionCount: 50,
    };
    const occurrence: QuestionSourceReference = {
      sourceId: legacySource.id,
      questionNumber: "12",
      modified: true,
    };

    render(
      <QuestionSourceCitation
        reference={reference}
        source={source}
        additionalReferences={[occurrence]}
        sourceMap={{ [legacySource.id]: legacySource }}
        publisher={publisher}
      />,
    );

    expect(screen.getByText("同一問題の出題履歴：", { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: `${legacySource.title} 問12`,
      }),
    ).toHaveAttribute("href", legacySource.questionPdf?.url);
  });
});
