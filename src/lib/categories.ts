import fs from "fs";
import path from "path";
import type { Category, ExamMeta } from "@/types/exam";

const DATA_DIR = path.join(process.cwd(), "data");

export function getCategories(): Category[] {
  const filePath = path.join(DATA_DIR, "categories.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const entries = JSON.parse(raw) as Array<
    Omit<Category, "description" | "passingScore">
  >;

  return entries.map((entry) => {
    const metaPath = path.join(DATA_DIR, "exams", entry.id, "meta.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ExamMeta;
    return {
      ...entry,
      description: meta.description,
      passingScore: meta.passingScore,
    };
  });
}
