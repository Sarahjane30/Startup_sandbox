from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data_sets"
DEFAULT_OUT = ROOT / "models" / "startup_rag_index.pkl"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

SUCCESS_FILES = [
    "success_finance.csv",
    "success_health_care.csv",
    "success_information.csv",
    "success_retail.csv",
    "success_education.csv",
    "big_startup_secsees_dataset.csv",
    "startups.csv",
]

FAILURE_FILES = [
    "master_failure_dataset.csv",
    "Startup Failure (Finance and Insurance).csv",
    "Startup Failure (Food and services).csv",
    "Startup Failure (Health Care).csv",
    "Startup Failure (Manufactures).csv",
    "Startup Failure (Retail Trade).csv",
    "Startup Failures (Information Sector).csv",
]


def text(value: object) -> str:
    return str(value or "").replace("\n", " ").strip()


def clean_money(value: object) -> float:
    raw = text(value).replace("$", "").replace(",", "").lower()
    if not raw or raw in {"-", "nan", "none"}:
        return 0.0
    multiplier = 1.0
    if "b" in raw:
        multiplier = 1_000_000_000
    elif "m" in raw:
        multiplier = 1_000_000
    elif "k" in raw:
        multiplier = 1_000
    match = re.search(r"\d+(?:\.\d+)?", raw)
    return float(match.group(0)) * multiplier if match else 0.0


def founded_age(value: object) -> float | None:
    raw = text(value)
    match = re.search(r"(19\d{2}|20\d{2})", raw)
    if not match:
        return None
    age = 2026 - int(match.group(1))
    return float(age) if 0 <= age <= 100 else None


def normalize_status(status: object, default_target: int) -> int:
    value = text(status).lower()
    if value in {"acquired", "ipo", "operating"}:
        return 1
    if value in {"closed", "failed", "failure", "shutdown"}:
        return 0
    return default_target


def record(
    *,
    name: object,
    sector: object,
    status: object,
    target: int,
    funding: object,
    age: object,
    description: object = "",
    failure_reason: object = "",
    takeaway: object = "",
    source_file: str,
) -> dict:
    name_s = text(name)
    sector_s = text(sector)
    status_s = text(status)
    description_s = text(description)
    reason_s = text(failure_reason)
    takeaway_s = text(takeaway)
    funding_n = clean_money(funding)
    age_n = age if isinstance(age, (int, float)) else founded_age(age)
    if age_n is not None:
        try:
            age_n = float(age_n)
        except (TypeError, ValueError):
            age_n = None
    if age_n is not None and not (0 <= age_n <= 100):
        age_n = None
    evidence_text = " ".join(
        part
        for part in [
            name_s,
            sector_s,
            status_s,
            description_s,
            reason_s,
            takeaway_s,
            f"funding {funding_n:.0f}" if funding_n else "",
        ]
        if part
    )
    return {
        "name": name_s,
        "sector": sector_s,
        "status": status_s,
        "target": int(target),
        "funding_total_usd": funding_n,
        "company_age": age_n,
        "description": description_s,
        "failure_reason": reason_s,
        "takeaway": takeaway_s,
        "source_file": source_file,
        "evidence_text": evidence_text,
    }


def load_success_file(path: Path) -> list[dict]:
    df = pd.read_csv(path, low_memory=False)
    rows = []
    for _, row in df.iterrows():
        name = row.get("name", row.get("company_name", ""))
        sector = row.get("category_list", row.get("sector", row.get("market", "")))
        status = row.get("status", "success")
        target = normalize_status(status, 1)
        if not text(name) or not text(sector):
            continue
        rows.append(
            record(
                name=name,
                sector=sector,
                status=status,
                target=target,
                funding=row.get("funding_total_usd", 0),
                age=row.get("company_age", row.get("founded_at", row.get("founded_year", ""))),
                description=sector,
                source_file=path.name,
            )
        )
    return rows


def load_failure_file(path: Path) -> list[dict]:
    df = pd.read_csv(path, low_memory=False)
    rows = []
    for _, row in df.iterrows():
        name = row.get("Name", row.get("name", ""))
        sector = row.get("Sector", row.get("sector", ""))
        if not text(name) or not text(sector):
            continue
        rows.append(
            record(
                name=name,
                sector=sector,
                status="failed",
                target=0,
                funding=row.get("How Much They Raised", row.get("funding_total_usd", 0)),
                age=row.get("Years of Operation", row.get("company_age", "")),
                description=row.get("What They Did", ""),
                failure_reason=row.get("Why They Failed", ""),
                takeaway=row.get("Takeaway", ""),
                source_file=path.name,
            )
        )
    return rows


def build_records(extra_csv_dir: Path | None = None) -> list[dict]:
    records = []
    for file_name in SUCCESS_FILES:
        path = DATA_DIR / file_name
        if path.exists():
            records.extend(load_success_file(path))
    for file_name in FAILURE_FILES:
        path = DATA_DIR / file_name
        if path.exists():
            records.extend(load_failure_file(path))

    if extra_csv_dir and extra_csv_dir.exists():
        known = set(SUCCESS_FILES + FAILURE_FILES)
        for path in extra_csv_dir.glob("*.csv"):
            if path.name in known:
                continue
            try:
                records.extend(load_success_file(path))
            except Exception:
                continue

    seen = set()
    unique = []
    for row in records:
        key = (row["name"].lower(), row["sector"].lower(), row["target"], row["source_file"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a startup RAG evidence index from local CSV datasets.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--extra-csv-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--max-rows", type=int, default=8000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    records = build_records(args.extra_csv_dir)
    failure_records = [row for row in records if row["target"] == 0]
    success_records = [row for row in records if row["target"] == 1]
    rng = np.random.default_rng(args.seed)
    success_limit = max(0, args.max_rows - len(failure_records))
    if len(success_records) > success_limit:
        picked = rng.choice(len(success_records), size=success_limit, replace=False)
        success_records = [success_records[int(i)] for i in picked]
    records = failure_records + success_records
    rng.shuffle(records)
    texts = [row["evidence_text"] for row in records]

    model = SentenceTransformer(EMBEDDING_MODEL)
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=True,
        batch_size=64,
    ).astype(np.float32)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    artifact = {
        "embedding_model": EMBEDDING_MODEL,
        "records": records,
        "embeddings": embeddings,
        "source_counts": pd.Series([row["source_file"] for row in records]).value_counts().to_dict(),
    }
    joblib.dump(artifact, args.out)
    print(json.dumps({
        "saved": str(args.out),
        "records": len(records),
        "sources": artifact["source_counts"],
    }, indent=2))


if __name__ == "__main__":
    main()
