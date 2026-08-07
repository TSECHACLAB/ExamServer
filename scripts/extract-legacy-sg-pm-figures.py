from __future__ import annotations

"""Locate PM figures with transcription templates and publish IPA-only crops."""

import hashlib
import json
import math
import os
import subprocess
import urllib.request
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = (
    ROOT
    / "artifacts"
    / "question-content"
    / "legacy-sg-pm-figure-manifest.json"
)
AUDIT_OUTPUT = (
    ROOT / "artifacts" / "question-content" / "legacy-sg-pm-figure-audit.json"
)
TEMP_ROOT = ROOT / "tmp" / "pdfs" / "legacy-sg-pm-figures"
PDFTOPPM = Path(
    r"C:\Users\phrx4\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe"
)
RENDER_DPI = 180
MIN_MATCH_SCORE = float(os.environ.get("SG_PM_FIGURE_MIN_SCORE", "0.42"))
ONLY_ID = os.environ.get("SG_PM_FIGURE_ONLY")
RESTART_AT = os.environ.get("SG_PM_FIGURE_RESTART_AT")
ORB = cv2.ORB_create(nfeatures=3500, scaleFactor=1.15, nlevels=10)
PAGE_FEATURE_CACHE: dict[str, np.ndarray | None] = {}

# A small number of answer tables are deliberately near-identical.  The
# transcription image for this item has the same dimensions and most of the
# same cells as the preceding d1/d2 table, so correlation alone selects the
# wrong table.  The page was confirmed against the official IPA PDF during the
# 151-image side-by-side review.
OFFICIAL_PAGE_OVERRIDES: dict[str, list[int]] = {
    "sg-2017-autumn-pm-q03-u06-choices-f01": [39],
}


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


def likely_page_indexes(
    page_count: int, major: int, previous_page: int | None
) -> list[int]:
    approximate_start = math.floor((major - 1) * page_count / 3) + 1
    approximate_end = math.ceil(major * page_count / 3)
    start = max(1, approximate_start - 7)
    end = min(page_count, approximate_end + 7)
    if previous_page is not None:
        start = max(start, previous_page - 1)
    return list(range(start, end + 1))


def feature_ranked_pages(
    template: np.ndarray,
    pages: list[Path],
    indexes: list[int],
) -> tuple[list[int], dict[int, int]]:
    _keypoints, template_descriptors = ORB.detectAndCompute(template, None)
    if template_descriptors is None or len(template_descriptors) < 20:
        return indexes, {}
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    scores: dict[int, int] = {}
    for page_number in indexes:
        page_path = pages[page_number - 1]
        cache_key = str(page_path)
        if cache_key not in PAGE_FEATURE_CACHE:
            page = cv2.imread(str(page_path), cv2.IMREAD_GRAYSCALE)
            if page is None:
                raise RuntimeError(f"Cannot read rendered page {page_number}")
            _page_keypoints, descriptors = ORB.detectAndCompute(page, None)
            PAGE_FEATURE_CACHE[cache_key] = descriptors
        page_descriptors = PAGE_FEATURE_CACHE[cache_key]
        if page_descriptors is None:
            scores[page_number] = 0
            continue
        pairs = matcher.knnMatch(template_descriptors, page_descriptors, k=2)
        scores[page_number] = sum(
            1
            for pair in pairs
            if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance
        )
    maximum = max(scores.values(), default=0)
    if maximum < 20:
        return indexes, scores
    # Repeated answer tables can have a deceptively high pixel correlation.
    # Descriptor agreement carries the row/header content, so only retain
    # pages close to the strongest feature match before pixel refinement.
    minimum = max(12, round(maximum * 0.60))
    ranked = [
        page
        for page, score in sorted(scores.items(), key=lambda item: -item[1])
        if score >= minimum
    ]
    return ranked or indexes, scores


def find_single_template(
    template: np.ndarray,
    template_name: str,
    pages: list[Path],
    candidate_indexes: list[int],
) -> dict[str, object]:
    best: tuple[float, int | None, float, tuple[int, int, int, int]] = (
        -1.0,
        None,
        1.0,
        (0, 0, 0, 0),
    )

    def search(indexes: list[int], scales: list[float]) -> None:
        nonlocal best
        for page_number in indexes:
            page = cv2.imread(str(pages[page_number - 1]), cv2.IMREAD_GRAYSCALE)
            if page is None:
                raise RuntimeError(f"Cannot read rendered page {page_number}")
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
                        page_number,
                        float(scale),
                        (location[0], location[1], width, height),
                    )

    ranked_indexes, feature_scores = feature_ranked_pages(
        template, pages, candidate_indexes
    )
    search(ranked_indexes, list(np.arange(1.6, 2.11, 0.1)))
    if best[1] is not None:
        center = best[2]
        search(
            [best[1]],
            [
                round(value, 3)
                for value in np.arange(max(0.5, center - 0.09), center + 0.091, 0.02)
            ],
        )
    feature_strength = max(feature_scores.values(), default=0)
    effective_threshold = 0.35 if feature_strength >= 30 else MIN_MATCH_SCORE
    if best[0] < effective_threshold:
        # Some diagrams contain too few stable text features. If the
        # descriptor shortlist is inconclusive, restore the complete likely
        # page range before expanding to the whole booklet.
        search(candidate_indexes, list(np.arange(1.6, 2.11, 0.1)))
        if best[1] is not None:
            center = best[2]
            search(
                [best[1]],
                [
                    round(value, 3)
                    for value in np.arange(
                        max(0.5, center - 0.09), center + 0.091, 0.02
                    )
                ],
            )
    if best[0] < effective_threshold:
        # Fixed thirds are only an optimization. A full-page fallback keeps the
        # audit correct when one major question occupies unusually many pages.
        full_indexes, full_feature_scores = feature_ranked_pages(
            template, pages, list(range(1, len(pages) + 1))
        )
        feature_scores.update(full_feature_scores)
        feature_strength = max(feature_scores.values(), default=0)
        effective_threshold = 0.35 if feature_strength >= 30 else MIN_MATCH_SCORE
        search(full_indexes, list(np.arange(0.8, 3.01, 0.2)))
        if best[1] is not None:
            center = best[2]
            search(
                [best[1]],
                [
                    round(value, 3)
                    for value in np.arange(
                        max(0.5, center - 0.12), center + 0.121, 0.02
                    )
                ],
            )
    if best[0] < effective_threshold or best[1] is None:
        raise RuntimeError(
            f"Template match below threshold for {template_name}: {best[0]:.3f}"
        )
    return {
        "score": round(best[0], 4),
        "page": best[1],
        "featureMatches": feature_scores.get(best[1], 0),
        "scale": round(best[2], 3),
        "box": list(best[3]),
    }


def trim_blank_rows(template: np.ndarray) -> np.ndarray:
    nonwhite = np.where((template < 248).mean(axis=1) > 0.002)[0]
    if len(nonwhite) == 0:
        return template
    return template[max(0, nonwhite[0] - 2) : min(template.shape[0], nonwhite[-1] + 3)]


def split_composite_template(template: np.ndarray) -> list[np.ndarray]:
    whiteness = (template > 248).mean(axis=1)
    candidate = whiteness > 0.99
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, is_blank in enumerate(candidate):
        if is_blank and start is None:
            start = index
        elif not is_blank and start is not None:
            if index - start >= 10:
                runs.append((start, index))
            start = None
    if start is not None and len(candidate) - start >= 10:
        runs.append((start, len(candidate)))

    cuts = [
        (left + right) // 2
        for left, right in runs
        if template.shape[0] * 0.12 < left < template.shape[0] * 0.88
    ]
    boundaries = [0, *cuts, template.shape[0]]
    segments = [
        trim_blank_rows(template[top:bottom])
        for top, bottom in zip(boundaries, boundaries[1:])
        if bottom - top >= 60
    ]
    return [segment for segment in segments if segment.shape[0] >= 50]


def find_template_parts(
    template_path: Path,
    pages: list[Path],
    candidate_indexes: list[int],
) -> list[dict[str, object]]:
    template = cv2.imread(str(template_path), cv2.IMREAD_GRAYSCALE)
    if template is None:
        raise RuntimeError(f"Cannot read template {template_path}")
    try:
        return [
            find_single_template(
                template, template_path.name, pages, candidate_indexes
            )
        ]
    except RuntimeError as original_error:
        segments = split_composite_template(template)
        if len(segments) < 2 or len(segments) > 5:
            raise original_error
        matches: list[dict[str, object]] = []
        previous_page: int | None = None
        for index, segment in enumerate(segments, start=1):
            segment_candidates = candidate_indexes
            if previous_page is not None:
                segment_candidates = [
                    page
                    for page in candidate_indexes
                    if page >= previous_page - 1
                ]
            match = find_single_template(
                segment,
                f"{template_path.name} part {index}/{len(segments)}",
                pages,
                segment_candidates,
            )
            match["part"] = index
            match["partCount"] = len(segments)
            matches.append(match)
            previous_page = int(match["page"])
        return matches


def crop_region(page_path: Path, box: list[int]) -> tuple[np.ndarray, list[int]]:
    page = cv2.imread(str(page_path), cv2.IMREAD_COLOR)
    if page is None:
        raise RuntimeError(f"Cannot read rendered page {page_path}")
    left, top, width, height = [int(value) for value in box]
    margin = 24
    left = max(0, left - margin)
    top = max(0, top - margin)
    right = min(page.shape[1], left + width + margin * 2)
    bottom = min(page.shape[0], top + height + margin * 2)
    crop = page[top:bottom, left:right]
    return crop, [left, top, right - left, bottom - top]


def crop_official_regions(
    pages: list[Path], matches: list[dict[str, object]], output: Path
) -> list[list[int]]:
    crops_and_boxes = [
        crop_region(pages[int(match["page"]) - 1], match["box"])
        for match in matches
    ]
    crops = [item[0] for item in crops_and_boxes]
    width = max(crop.shape[1] for crop in crops)
    separator = 16
    height = sum(crop.shape[0] for crop in crops) + separator * (len(crops) - 1)
    combined = np.full((height, width, 3), 255, dtype=np.uint8)
    top = 0
    for crop in crops:
        left = (width - crop.shape[1]) // 2
        combined[top : top + crop.shape[0], left : left + crop.shape[1]] = crop
        top += crop.shape[0] + separator
    output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output), combined, [cv2.IMWRITE_PNG_COMPRESSION, 9]):
        raise RuntimeError(f"Failed to write {output}")
    return [item[1] for item in crops_and_boxes]


def checkpoint(manifest: dict[str, object], records: list[dict[str, object]]) -> None:
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


def main() -> None:
    if not MANIFEST.exists():
        raise RuntimeError(
            "Run npx tsx scripts/build-legacy-sg-pm.ts --figure-manifest first"
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
    pdf_hash_cache: dict[str, str] = {}
    previous_page_by_major: dict[tuple[str, str], int] = {}
    records: list[dict[str, object]] = []
    if not ONLY_ID and AUDIT_OUTPUT.exists():
        existing = json.loads(AUDIT_OUTPUT.read_text(encoding="utf-8"))
        candidate_records = existing.get("records", [])
        expected_ids = [figure["id"] for figure in figures]
        existing_ids = [record.get("id") for record in candidate_records]
        if existing_ids == expected_ids[: len(existing_ids)] and all(
            "matches" in record for record in candidate_records
        ):
            records = candidate_records
            for figure, record in zip(figures, records):
                output = ROOT / "public" / figure["output"].lstrip("/")
                if not output.exists() or sha256(output) != record["outputSha256"]:
                    records = []
                    break
                pages_used = record.get("pages") or [record.get("page")]
                previous_page_by_major[
                    (figure["sourceId"], figure["majorQuestionNumber"])
                ] = max(int(page) for page in pages_used if page is not None)
            if records:
                if RESTART_AT:
                    restart_index = expected_ids.index(RESTART_AT)
                    records = records[:restart_index]
                    previous_page_by_major.clear()
                    for figure, record in zip(figures, records):
                        pages_used = record.get("pages") or [record.get("page")]
                        previous_page_by_major[
                            (figure["sourceId"], figure["majorQuestionNumber"])
                        ] = max(
                            int(page) for page in pages_used if page is not None
                        )
                    print(
                        f"Restarting at {RESTART_AT} after {len(records)} verified figures",
                        flush=True,
                    )
                print(f"Resuming after {len(records)} verified figures", flush=True)

    for index, figure in enumerate(figures[len(records) :], start=len(records) + 1):
        source_id = figure["sourceId"]
        pdf_meta = figure["officialPdf"]
        pdf_path = TEMP_ROOT / "pdf" / f"{source_id}.pdf"
        download(pdf_meta["url"], pdf_path)
        actual_pdf_hash = pdf_hash_cache.get(source_id) or sha256(pdf_path)
        pdf_hash_cache[source_id] = actual_pdf_hash
        if actual_pdf_hash != pdf_meta["sha256"]:
            raise RuntimeError(f"{source_id}: official PDF hash mismatch")
        pages = page_cache.get(source_id)
        if pages is None:
            pages = render_pdf(pdf_path, TEMP_ROOT / "rendered" / source_id)
            page_cache[source_id] = pages

        template_path = TEMP_ROOT / "templates" / figure["id"] / figure["filename"]
        download(figure["sourceUrl"], template_path)
        major_key = (source_id, figure["majorQuestionNumber"])
        candidate_indexes = OFFICIAL_PAGE_OVERRIDES.get(figure["id"])
        if candidate_indexes is None:
            candidate_indexes = likely_page_indexes(
                len(pages),
                int(figure["majorQuestionNumber"]),
                previous_page_by_major.get(major_key),
            )
        matches = find_template_parts(template_path, pages, candidate_indexes)
        pages_used = [int(match["page"]) for match in matches]
        previous_page_by_major[major_key] = max(pages_used)
        output = ROOT / "public" / figure["output"].lstrip("/")
        crop_boxes = crop_official_regions(pages, matches, output)
        records.append(
            {
                "id": figure["id"],
                "scenarioId": figure["scenarioId"],
                "ownerId": figure["ownerId"],
                "role": figure["role"],
                "sourceId": source_id,
                "officialPdfSha256": actual_pdf_hash,
                "pages": pages_used,
                "matches": matches,
                "templateSha256": sha256(template_path),
                "cropBoxes": crop_boxes,
                "output": figure["output"],
                "outputSha256": sha256(output),
            }
        )
        checkpoint(manifest, records)
        print(
            f"[{index}/{len(figures)}] {figure['id']} pages "
            f"{','.join(str(page) for page in pages_used)} score "
            f"{min(float(match['score']) for match in matches):.3f}",
            flush=True,
        )
    print(f"Wrote {AUDIT_OUTPUT.relative_to(ROOT)} ({len(records)} figures)")


if __name__ == "__main__":
    main()
