#!/usr/bin/env python3
"""Utility helpers for Python-based PDF extraction fallbacks."""
from __future__ import annotations

import argparse
import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

DATE_TIME_RE = re.compile(r"(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})")
AMOUNT_RE = re.compile(r"([+-]?\d[\d\s]*,\d{2})\s*(₽|rub|rur)?", re.IGNORECASE)
BOOKING_RE = re.compile(r"^(\d{2}\.\d{2}\.\d{4})\s+(.*)$")
CARD_RE = re.compile(r"(\d{4}\s\*{4}\s\d{4}|\d{4}\*{4}\d{4})")
PAGE_RE = re.compile(r"страница\s+\d+", re.IGNORECASE)
BALANCE_RE = re.compile(r"остаток на счете", re.IGNORECASE)
INVESTKOPILKA_RE = re.compile(r"инвесткопилка", re.IGNORECASE)


@dataclass
class RawOperation:
    """Intermediate representation of an operation extracted from Tinkoff PDF."""

    id: str
    date: str
    booking_date: Optional[str]
    amount: float
    sign: int
    title_raw: str
    description_parts: List[str] = field(default_factory=list)
    card: Optional[str] = None

    @property
    def description(self) -> str:
        text = " ".join(self.description_parts).strip()
        return re.sub(r"\s+", " ", text)


def parse_amount(value: Optional[str]) -> float:
    if not value:
        return 0.0
    normalized = re.sub(r"\s+", "", value)
    normalized = normalized.replace(",", ".")
    normalized = re.sub(r"[^0-9\.-]", "", normalized)
    try:
        return float(normalized)
    except ValueError:
        return 0.0


def to_iso(date: str, time: Optional[str] = None) -> str:
    day, month, year = date.split(".")
    iso_date = f"{year}-{month}-{day}"
    return f"{iso_date}T{time}:00" if time else iso_date


def make_id() -> str:
    return f"tbank_{uuid.uuid4().hex[:12]}"


def contains_investkopilka(*values: Optional[str]) -> bool:
    parts: List[str] = []
    for value in values:
        if not value:
            continue
        parts.append(str(value))
    haystack = " ".join(parts).strip()
    return bool(haystack) and bool(INVESTKOPILKA_RE.search(haystack))


def finalize_operation(current: Optional[RawOperation], operations: List[RawOperation]) -> Optional[RawOperation]:
    if not current:
        return None
    if contains_investkopilka(current.description, current.title_raw):
        return None
    operations.append(current)
    return None


def parse_page_lines(pages: Sequence[Sequence[str]]) -> List[RawOperation]:
    operations: List[RawOperation] = []
    flat_lines: List[str] = []
    for lines in pages:
        flat_lines.extend(lines)

    current: Optional[RawOperation] = None

    for line in flat_lines:
        if "дата и время операции".lower() in line.lower():
            continue
        date_match = DATE_TIME_RE.search(line)
        if date_match:
            current = finalize_operation(current, operations)
            date, time = date_match.groups()
            remainder = DATE_TIME_RE.sub("", line).strip()
            booking_match = BOOKING_RE.match(remainder)
            booking_date = None
            if booking_match:
                booking_date = booking_match.group(1)
                remainder = booking_match.group(2).strip()
            amount_match = AMOUNT_RE.search(remainder)
            amount = 0.0
            if amount_match:
                amount = parse_amount(amount_match.group(1))
                remainder = remainder.replace(amount_match.group(0), "").strip()
            current = RawOperation(
                id=make_id(),
                date=to_iso(date, time),
                booking_date=to_iso(booking_date) if booking_date else None,
                amount=amount,
                sign=1 if amount >= 0 else -1,
                title_raw=remainder,
                description_parts=[remainder] if remainder else [],
                card=None,
            )
            card_match = CARD_RE.search(remainder)
            if card_match:
                current.card = card_match.group(1)
            continue

        if current is None:
            continue
        if PAGE_RE.search(line) or BALANCE_RE.search(line):
            continue
        current.description_parts.append(line)
        if current.card is None:
            card_match = CARD_RE.search(line)
            if card_match:
                current.card = card_match.group(1)

    finalize_operation(current, operations)
    return operations


def normalize_operations(raw_operations: Iterable[RawOperation]) -> List[dict]:
    normalized: List[dict] = []
    for op in raw_operations:
        if op.amount == 0:
            continue
        description = op.description or op.title_raw or ""
        description = re.sub(r"\s+", " ", description).strip()
        normalized.append(
            {
                "id": op.id,
                "bank": "tbank",
                "date": op.date,
                "bookingDate": op.booking_date,
                "amount": op.amount,
                "sign": op.sign,
                "currency": "RUB",
                "title_raw": description,
                "title": description,
                "category": None,
                "subcategory": None,
                "counterparty": None,
                "mcc": None,
                "project": None,
                "tags": [],
                "comment": "",
                "card": op.card,
                "source_pdf": "tbank",
            }
        )
    return normalized


def parse_tbank_from_payload(payload: dict) -> List[dict]:
    pages = payload.get("pages", [])
    page_lines: List[List[str]] = []
    for page in pages:
        text = page.get("text", "")
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
        lines = [line for line in lines if line]
        page_lines.append(lines)
    raw_operations = parse_page_lines(page_lines)
    return normalize_operations(raw_operations)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract normalized operations from worker JSON output")
    parser.add_argument("input", type=Path, help="Path to JSON produced by worker.py --format json")
    parser.add_argument("--output", type=Path, help="Where to write normalized operations JSON")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    operations = parse_tbank_from_payload(payload)
    data = json.dumps(operations, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(data, encoding="utf-8")
        print(f"Saved: {args.output}")
    else:
        print(data)


if __name__ == "__main__":
    main()
