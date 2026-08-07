from __future__ import annotations

"""Extract legacy SG figures from hash-verified IPA PDFs.

The third-party image is used only as a visual template to locate the same
figure on the official PDF page. Every published output pixel is cropped from
the IPA PDF render, never from the template image.
"""

import hashlib
import json
import math
import os
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = (
    ROOT
    / "artifacts"
    / "question-content"
    / "legacy-sg-am-figure-manifest.json"
)
AUDIT_OUTPUT = (
    ROOT / "artifacts" / "question-content" / "legacy-sg-am-figure-audit.json"
)
TEMP_ROOT = ROOT / "tmp" / "pdfs" / "legacy-sg-am-figures"
PUBLIC_ROOT = ROOT / "public" / "exams" / "sg" / "legacy"
PDFTOPPM = Path(
    r"C:\Users\phrx4\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe"
)
RENDER_DPI = 180
MIN_MATCH_SCORE = float(os.environ.get("SG_FIGURE_MIN_SCORE", "0.48"))
ONLY_ID = os.environ.get("SG_FIGURE_ONLY")


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
        url, headers={"User-Agent": "ExamServer official-PDF figure audit/1.0"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())


def render_pdf(pdf: Path, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(output_dir.glob("page-*.png"))
    if existing:
        return existing
    subprocess.run(
        [
            str(PDFTOPPM),
            "-png",
            "-r",
            str(RENDER_DPI),
            str(pdf),
            str(output_dir / "page"),
        ],
        check=True,
    )
    pages = sorted(output_dir.glob("page-*.png"))
    if not pages:
        raise RuntimeError(f"No pages rendered from {pdf}")
    return pages


def estimated_pdf_page(question_number: int) -> int:
    # Legacy AM booklets place questions across printed pages 3 through 23.
    return 3 + round((question_number - 1) * 20 / 49)


def candidate_pages(pages: list[Path], question_number: int) -> list[Path]:
    estimate = estimated_pdf_page(question_number)
    indexes = [
        index
        for index in range(estimate - 3, estimate + 4)
        if 1 <= index <= len(pages)
    ]
    return [pages[index - 1] for index in indexes]


def find_template(
    template_path: Path, pages: list[Path], question_number: int
) -> dict[str, object]:
    template = cv2.imread(str(template_path), cv2.IMREAD_GRAYSCALE)
    if template is None:
        raise RuntimeError(f"Cannot read template {template_path}")

    best: tuple[float, Path | None, float, tuple[int, int, int, int]] = (
        -1.0,
        None,
        1.0,
        (0, 0, 0, 0),
    )

    def search(page_paths: list[Path], scales: list[float]) -> None:
        nonlocal best
        for page_path in page_paths:
            page = cv2.imread(str(page_path), cv2.IMREAD_GRAYSCALE)
            if page is None:
                raise RuntimeError(f"Cannot read rendered page {page_path}")
            for scale in scales:
                width = max(8, round(template.shape[1] * scale))
                height = max(8, round(template.shape[0] * scale))
                if width >= page.shape[1] or height >= page.shape[0]:
                    continue
                resized = cv2.resize(
                    template, (width, height), interpolation=cv2.INTER_CUBIC
                )
                result = cv2.matchTemplate(page, resized, cv2.TM_CCOEFF_NORMED)
                _, score, _, location = cv2.minMaxLoc(result)
                if score > best[0]:
                    best = (
                        float(score),
                        page_path,
                        float(scale),
                        (location[0], location[1], width, height),
                    )

    search(candidate_pages(pages, question_number), list(np.arange(0.8, 3.01, 0.1)))
    if best[1] is not None:
        center = best[2]
        search(
            [best[1]],
            [
                round(value, 3)
                for value in np.arange(max(0.5, center - 0.09), center + 0.091, 0.02)
            ],
        )
    if best[0] < MIN_MATCH_SCORE or best[1] is None:
        raise RuntimeError(
            f"Template match below threshold for {template_path.name}: {best[0]:.3f}"
        )
    page_number = int(best[1].stem.split("-")[-1])
    return {
        "score": round(best[0], 4),
        "page": page_number,
        "scale": round(best[2], 3),
        "box": list(best[3]),
    }


def crop_official_page(
    page_path: Path, matches: list[dict[str, object]], output: Path
) -> list[int]:
    page = cv2.imread(str(page_path), cv2.IMREAD_COLOR)
    if page is None:
        raise RuntimeError(f"Cannot read rendered page {page_path}")
    boxes = [match["box"] for match in matches]
    left = min(int(box[0]) for box in boxes)
    top = min(int(box[1]) for box in boxes)
    right = max(int(box[0]) + int(box[2]) for box in boxes)
    bottom = max(int(box[1]) + int(box[3]) for box in boxes)
    margin = 24
    left = max(0, left - margin)
    top = max(0, top - margin)
    right = min(page.shape[1], right + margin)
    bottom = min(page.shape[0], bottom + margin)
    crop = page[top:bottom, left:right]
    output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output), crop, [cv2.IMWRITE_PNG_COMPRESSION, 9]):
        raise RuntimeError(f"Failed to write {output}")
    return [left, top, right - left, bottom - top]


def main() -> None:
    if not MANIFEST.exists():
        raise RuntimeError(
            "Figure manifest is missing; run npx tsx scripts/build-legacy-sg-am.ts --figure-manifest"
        )
    if not PDFTOPPM.exists():
        raise RuntimeError(f"pdftoppm is missing: {PDFTOPPM}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    figures = manifest["figures"]
    if ONLY_ID:
        figures = [figure for figure in figures if figure["id"] == ONLY_ID]
        if not figures:
            raise RuntimeError(f"Figure ID is not in the manifest: {ONLY_ID}")
    page_cache: dict[str, list[Path]] = {}
    records: list[dict[str, object]] = []

    for index, figure in enumerate(figures, start=1):
        source_id = figure["sourceId"]
        pdf_meta = figure["officialPdf"]
        pdf_path = TEMP_ROOT / "pdf" / f"{source_id}.pdf"
        download(pdf_meta["url"], pdf_path)
        actual_pdf_hash = sha256(pdf_path)
        if actual_pdf_hash != pdf_meta["sha256"]:
            raise RuntimeError(
                f"{source_id}: official PDF hash mismatch ({actual_pdf_hash})"
            )
        pages = page_cache.get(source_id)
        if pages is None:
            pages = render_pdf(pdf_path, TEMP_ROOT / "rendered" / source_id)
            page_cache[source_id] = pages

        matches: list[dict[str, object]] = []
        for marker_file in figure["markerFiles"]:
            template_url = urllib.parse.urljoin(
                figure["transcriptionUrl"], f"img/{marker_file}"
            )
            template_path = (
                TEMP_ROOT / "templates" / figure["id"] / marker_file
            )
            download(template_url, template_path)
            match = find_template(
                template_path, pages, int(figure["questionNumber"])
            )
            match["markerFile"] = marker_file
            matches.append(match)

        matched_pages = {int(match["page"]) for match in matches}
        if len(matched_pages) != 1:
            raise RuntimeError(
                f"{figure['id']}: markers matched different pages {sorted(matched_pages)}"
            )
        page_number = matched_pages.pop()
        output = ROOT / "public" / figure["output"].lstrip("/")
        crop_box = crop_official_page(pages[page_number - 1], matches, output)
        records.append(
            {
                "id": figure["id"],
                "sourceId": source_id,
                "officialPdfSha256": actual_pdf_hash,
                "page": page_number,
                "matches": matches,
                "cropBox": crop_box,
                "output": figure["output"],
                "outputSha256": sha256(output),
            }
        )
        AUDIT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        AUDIT_OUTPUT.write_text(
            json.dumps(
                {
                    "generatedAt": manifest["generatedAt"],
                    "renderDpi": RENDER_DPI,
                    "minimumMatchScore": MIN_MATCH_SCORE,
                    "records": records,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(
            f"[{index}/{len(figures)}] {figure['id']} page {page_number} "
            f"score {min(float(match['score']) for match in matches):.3f}"
        )

    print(f"Wrote {AUDIT_OUTPUT.relative_to(ROOT)} ({len(records)} figures)")


if __name__ == "__main__":
    main()
