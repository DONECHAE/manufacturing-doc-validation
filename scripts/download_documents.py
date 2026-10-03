#!/usr/bin/env python3
from __future__ import annotations

import csv
import mimetypes
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "documents.csv"
DEFAULT_OUTPUT = ROOT / "downloaded_documents.csv"
DOWNLOAD_DIR = ROOT / "source_files"


def clean(value: str, fallback: str = "unknown") -> str:
    value = (value or "").strip()
    value = re.sub(r"[\\/:*?\"<>|]+", "_", value)
    value = re.sub(r"\s+", "_", value)
    return value[:120] or fallback


def extension_from(url: str, content_type: str) -> str:
    path = urlparse(url).path
    ext = Path(path).suffix.lower()
    if ext and len(ext) <= 8:
        return ext
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guessed:
            return guessed
    return ".html"


def target_path(row: dict[str, str], url: str, content_type: str) -> Path:
    reviewer = clean(row.get("reviewer", ""), "자동다운로드")
    company = clean(row.get("company", ""), "COMMON")
    doc_id = clean(row.get("doc_id", ""), clean(row.get("candidate_id", ""), "0000"))
    number_match = re.search(r"(\d{3,})$", doc_id)
    sequence = number_match.group(1) if number_match else doc_id
    ext = extension_from(url, content_type)
    return DOWNLOAD_DIR / f"{reviewer}_{company}_{sequence}{ext}"


def download_one(row: dict[str, str], overwrite: bool) -> dict[str, str]:
    url = (row.get("url") or row.get("original_url") or "").strip()
    result = dict(row)
    if not url:
        result.update({"download_status": "다운로드실패", "download_error": "missing url"})
        return result

    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; manufacturing-doc-validation/1.0)",
            "Accept": "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            path = target_path(row, url, content_type)
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists() and not overwrite:
                result.update({
                    "file_path": str(path.relative_to(ROOT)),
                    "download_status": "이미존재",
                    "http_status": str(getattr(response, "status", "")),
                    "content_type": content_type,
                    "download_error": "",
                })
                return result
            data = response.read()
            path.write_bytes(data)
            result.update({
                "file_path": str(path.relative_to(ROOT)),
                "download_status": "다운로드완료",
                "http_status": str(getattr(response, "status", "")),
                "content_type": content_type,
                "download_error": "",
            })
    except HTTPError as exc:
        result.update({
            "download_status": "다운로드실패",
            "http_status": str(exc.code),
            "content_type": "",
            "download_error": str(exc),
        })
    except (URLError, TimeoutError, OSError) as exc:
        result.update({
            "download_status": "다운로드실패",
            "http_status": "",
            "content_type": "",
            "download_error": str(exc),
        })
    return result


def main() -> int:
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    overwrite = "--overwrite" in sys.argv

    if not input_path.exists():
        print(f"documents.csv 파일을 찾지 못했습니다: {input_path}")
        print("검증 화면에서 documents.csv 저장 버튼으로 파일을 내려받은 뒤, 이 폴더에 넣고 다시 실행하세요.")
        return 1

    with input_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    output_rows = [download_one(row, overwrite) for row in rows]
    fieldnames = list(dict.fromkeys(
        [name for row in output_rows for name in row.keys()]
        + ["file_path", "download_status", "http_status", "content_type", "download_error"]
    ))

    with DEFAULT_OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    counts: dict[str, int] = {}
    for row in output_rows:
        status = row.get("download_status", "")
        counts[status] = counts.get(status, 0) + 1
    print(f"처리 완료: {len(output_rows)}건")
    for status, count in sorted(counts.items()):
        print(f"- {status}: {count}건")
    print(f"결과 파일: {DEFAULT_OUTPUT}")
    print(f"다운로드 폴더: {DOWNLOAD_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
