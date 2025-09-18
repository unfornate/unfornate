#!/usr/bin/env python3
"""Простой fallback-воркер для вытягивания текста из PDF."""
import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
VENDOR = BASE_DIR / "vendor"
if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    print("[worker] pypdf не найден, устанавливаем во vendor…", file=sys.stderr)
    VENDOR.mkdir(exist_ok=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf", "--target", str(VENDOR)], stdout=sys.stderr)
    from pypdf import PdfReader


def extract_pages(path: Path):
    reader = PdfReader(str(path))
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        yield index, "\n".join(line.strip() for line in text.splitlines())


def main():
    parser = argparse.ArgumentParser(description="Fallback извлечение текста из PDF")
    parser.add_argument("pdf", type=Path, help="Путь до PDF выписки")
    parser.add_argument("--format", choices=["json", "csv", "text"], default="json")
    parser.add_argument("--output", type=Path, help="Файл результата")
    args = parser.parse_args()

    pages = list(extract_pages(args.pdf))
    if args.format == "json":
        payload = {"file": str(args.pdf), "pages": [{"page": page, "text": text} for page, text in pages]}
        data = json.dumps(payload, ensure_ascii=False, indent=2)
    elif args.format == "csv":
        output = []
        for page, text in pages:
            output.append({"page": page, "text": text})
        if args.output:
            with args.output.open("w", encoding="utf-8", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["page", "text"], delimiter=';')
                writer.writeheader()
                writer.writerows(output)
            print(f"Сохранено: {args.output}")
            return
        else:
            data = "page;text\n" + "\n".join(f"{row['page']};{row['text']}" for row in output)
    else:
        data = "\n\n".join(text for _, text in pages)

    if args.output:
        args.output.write_text(data, encoding="utf-8")
        print(f"Сохранено: {args.output}")
    else:
        print(data)


if __name__ == "__main__":
    main()
