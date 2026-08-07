from __future__ import annotations

"""Extract ordered answer labels from hash-verified IPA legacy SG PM PDFs."""

import hashlib
import json
import re
import urllib.request
import unicodedata
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "data" / "exams" / "sg" / "sources.json"
OUTPUT = (
    ROOT / "artifacts" / "question-content" / "legacy-sg-pm-answer-keys.json"
)
TEMP = ROOT / "tmp" / "pdfs" / "legacy-sg-pm-answer-keys"
ANSWER_LABELS = set("アイウエオカキクケコ")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return
    request = urllib.request.Request(
        url, headers={"User-Agent": "ExamServer official-answer audit/1.0"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def answer_labels(pdf_path: Path) -> list[str]:
    labels_by_major: dict[int, list[str]] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if "出題趣旨" in text:
                break
            for table in page.extract_tables():
                if not table:
                    continue
                header = table[0]
                try:
                    answer_column = next(
                        index
                        for index, cell in enumerate(header)
                        if cell and "正解" in cell
                    )
                except StopIteration:
                    continue
                major = None
                for row in table[1:]:
                    first_cell = row[0] if row else None
                    match = re.search(r"問\s*([1-9][0-9]*)", first_cell or "")
                    if match:
                        major = int(match.group(1))
                        break
                if major is None:
                    continue
                major_labels = labels_by_major.setdefault(major, [])
                for row in table[1:]:
                    if answer_column >= len(row) or not row[answer_column]:
                        continue
                    normalized = unicodedata.normalize("NFKC", row[answer_column])
                    # One official cell may contain multiple ordered answer slots
                    # (for example "アイカ"). Each slot is a separate select in
                    # the exercise UI, so retain every label in cell order.
                    major_labels.extend(
                        char for char in normalized if char in ANSWER_LABELS
                    )
    if sorted(labels_by_major) != [1, 2, 3]:
        raise RuntimeError(
            f"{pdf_path.name}: expected answer tables for major questions 1-3"
        )
    # pdfplumber can return side-by-side tables in visual-column order rather
    # than question-number order. The official major number is authoritative.
    return [
        label
        for major in sorted(labels_by_major)
        for label in labels_by_major[major]
    ]


def main() -> None:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    sources = [
        source
        for source in registry["sources"]
        if source.get("section") == "午後"
        and source.get("publicationStatus") == "published"
    ]
    records: list[dict[str, object]] = []
    for source in sources:
        answer_pdf = source["answerPdf"]
        pdf_path = TEMP / f"{source['id']}.pdf"
        download(answer_pdf["url"], pdf_path)
        actual_hash = sha256(pdf_path)
        if actual_hash != answer_pdf["sha256"]:
            raise RuntimeError(f"{source['id']}: answer PDF hash mismatch")
        labels = answer_labels(pdf_path)
        if len(labels) < 10:
            raise RuntimeError(
                f"{source['id']}: implausible answer count {len(labels)}"
            )
        records.append(
            {
                "sourceId": source["id"],
                "answerPdfSha256": actual_hash,
                "answerCount": len(labels),
                "labels": labels,
            }
        )
        print(f"{source['id']}: {len(labels)} answer units")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"sources": records}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
