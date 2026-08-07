import type { Question } from "@/types/exam";

export function getQuestionDomains(
  question: Pick<Question, "domain" | "domains">
): string[] {
  if (question.domains && question.domains.length > 0) return question.domains;
  return question.domain ? [question.domain] : [];
}

export function countUniqueQuestionsForDomains(
  domainQuestionIds: Record<string, string[]>,
  selectedDomains: string[]
): number {
  return new Set(
    selectedDomains.flatMap((domain) => domainQuestionIds[domain] ?? [])
  ).size;
}
