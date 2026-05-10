from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = ROOT / "models" / "ctgan_xgboost_strict_model.pkl"
DATA_DIR = ROOT / "data_sets"
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_EMBEDDING_MODEL = None
USE_HF_EMBEDDINGS = False
_ARTIFACT_CACHE: dict[str, dict] = {}
_FINAL_DATA_CACHE: tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame] | None = None
_GENERIC_CSV_CACHE: dict[str, pd.DataFrame] = {}
EXTRA_DATASET_FILES = [
    "yc_companies.csv",
    "Y_Combinator_2025.csv",
    "AI_Companies.csv",
]

SECTOR_KEYWORDS = {
    "finance": [
        "finance",
        "fintech",
        "bank",
        "loan",
        "insurance",
        "payment",
        "wallet",
        "invest",
        "credit",
        "accounting",
        "invoice",
        "invoices",
        "cash flow",
        "cashflow",
        "bill",
        "bills",
        "payroll",
        "bookkeeping",
        "tax",
    ],
    "health_care": [
        "health",
        "medical",
        "doctor",
        "hospital",
        "patient",
        "clinic",
        "medicine",
        "therapy",
        "diagnosis",
    ],
    "education": [
        "education",
        "school",
        "student",
        "teacher",
        "learn",
        "course",
        "tutor",
        "exam",
        "edtech",
    ],
    "retail": [
        "retail",
        "shop",
        "store",
        "commerce",
        "marketplace",
        "delivery",
        "fashion",
        "consumer",
    ],
    "food_services": [
        "food",
        "restaurant",
        "meal",
        "cafe",
        "kitchen",
        "hotel",
        "hospitality",
    ],
    "manufacturing": [
        "manufacturing",
        "factory",
        "hardware",
        "industrial",
        "supply chain",
        "logistics",
    ],
    "information": [
        "software",
        "app",
        "platform",
        "saas",
        "web",
        "mobile",
        "ai",
        "data",
        "analytics",
        "automation",
        "cloud",
    ],
    "pet_care": [
        "pet",
        "pets",
        "dog",
        "dogs",
        "cat",
        "cats",
        "veterinary",
        "vet",
        "animal",
        "owner",
        "owners",
        "grooming",
    ],
}


def clean_text(value: object) -> str:
    return str(value or "").strip()


def infer_sector_group(text: str) -> str:
    lower = text.lower()
    scores = {
        sector: sum(1 for keyword in keywords if keyword in lower)
        for sector, keywords in SECTOR_KEYWORDS.items()
    }
    best_sector, best_score = max(scores.items(), key=lambda item: item[1])
    return best_sector if best_score > 0 else "information"


def normalize_sector(value: object) -> str:
    text = clean_text(value).lower()
    if not text or text in {"0", "nan", "none"}:
        return "unknown"
    for sector, keywords in SECTOR_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return sector
    return text.split("|")[0].strip().replace(" ", "_")[:40]


def parse_money(text: str) -> float:
    lower = text.lower().replace(",", "")
    matches = re.findall(r"(?:\$|usd\s*)?(\d+(?:\.\d+)?)\s*(k|m|million|b|billion)?", lower)
    best = 0.0
    for raw_number, suffix in matches:
        value = float(raw_number)
        if suffix in {"k"}:
            value *= 1_000
        elif suffix in {"m", "million"}:
            value *= 1_000_000
        elif suffix in {"b", "billion"}:
            value *= 1_000_000_000
        best = max(best, value)
    return best


def parse_company_age(text: str) -> float:
    lower = text.lower()
    founded = re.search(r"founded\s+(?:in\s+)?(20\d{2}|19\d{2})", lower)
    if founded:
        return max(0.0, min(100.0, 2026 - int(founded.group(1))))

    age = re.search(r"(\d+(?:\.\d+)?)\s*(?:year|yr)s?\s+old", lower)
    if age:
        return max(0.0, min(100.0, float(age.group(1))))

    return 1.0


def build_features(payload: dict) -> dict:
    idea = clean_text(payload.get("idea"))
    funding = payload.get("funding_total_usd", payload.get("fundingTotalUsd"))
    age = payload.get("company_age", payload.get("companyAge"))

    funding_total_usd = float(funding) if funding not in [None, ""] else parse_money(idea)
    company_age = float(age) if age not in [None, ""] else parse_company_age(idea)
    sector_group = clean_text(payload.get("sector_group") or payload.get("sectorGroup"))
    if not sector_group:
        sector_group = infer_sector_group(idea)

    funding_total_usd = max(0.0, funding_total_usd)
    company_age = max(0.0, min(100.0, company_age))

    return {
        "funding_total_usd": funding_total_usd,
        "company_age": company_age,
        "sector_group": sector_group,
        "funding_log1p": math.log1p(funding_total_usd),
    }


def compact_money(value: object) -> str:
    try:
        amount = float(str(value).replace("$", "").replace(",", ""))
    except ValueError:
        return clean_text(value) or "unknown"
    if amount >= 1_000_000_000:
        return f"${amount / 1_000_000_000:.1f}B"
    if amount >= 1_000_000:
        return f"${amount / 1_000_000:.1f}M"
    if amount >= 1_000:
        return f"${amount / 1_000:.0f}K"
    return f"${amount:.0f}"


def clean_age(value: object) -> float | None:
    try:
        age = float(value)
    except (TypeError, ValueError):
        return None
    if age < 0 or age > 100:
        return None
    return age


def top_risk_patterns(rows: pd.DataFrame) -> list[dict]:
    risk_columns = [
        "Giants",
        "No Budget",
        "Competition",
        "Poor Market Fit",
        "Acquisition Stagnation",
        "Platform Dependency",
        "Monetization Failure",
        "Niche Limits",
        "Execution Flaws",
        "Trend Shifts",
        "Toxicity/Trust Issues",
        "Regulatory Pressure",
        "Overhype",
        "High Operational Costs",
    ]
    patterns = []
    for column in risk_columns:
        if column in rows.columns:
            values = pd.to_numeric(rows[column], errors="coerce").fillna(0)
            rate = float(values.mean()) if len(values) else 0.0
            if rate > 0:
                patterns.append({"risk": column, "rate": rate})
    return sorted(patterns, key=lambda item: item["rate"], reverse=True)[:5]


def embedding_model():
    global _EMBEDDING_MODEL
    if not USE_HF_EMBEDDINGS:
        return None
    if _EMBEDDING_MODEL is None:
        from sentence_transformers import SentenceTransformer

        _EMBEDDING_MODEL = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _EMBEDDING_MODEL


def tfidf_prune(idea: str, rows: pd.DataFrame, text_column: str, max_rows: int = 80) -> pd.DataFrame:
    if rows.empty:
        return rows
    corpus = rows[text_column].fillna("").astype(str).tolist()
    if len(rows) <= max_rows:
        return rows
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
    matrix = vectorizer.fit_transform([idea] + corpus)
    scores = cosine_similarity(matrix[0:1], matrix[1:]).ravel()
    picked = rows.copy()
    picked["_prune_score"] = scores
    return picked.sort_values("_prune_score", ascending=False).head(max_rows).drop(columns=["_prune_score"])


def nearest_rows(idea: str, rows: pd.DataFrame, text_column: str, limit: int = 3) -> pd.DataFrame:
    if rows.empty:
        return rows
    rows = tfidf_prune(idea, rows, text_column)
    corpus = rows[text_column].fillna("").astype(str).tolist()
    method = "tfidf"
    model = embedding_model() if USE_HF_EMBEDDINGS else None
    if model is not None:
        embeddings = model.encode([idea] + corpus, normalize_embeddings=True, show_progress_bar=False)
        scores = np.matmul(embeddings[1:], embeddings[0])
        method = "huggingface_sentence_transformer"
    else:
        vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
        matrix = vectorizer.fit_transform([idea] + corpus)
        scores = cosine_similarity(matrix[0:1], matrix[1:]).ravel()
    picked = rows.copy()
    picked["similarity"] = scores
    picked["similarity_method"] = method
    return picked.sort_values("similarity", ascending=False).head(limit)


def keyword_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", text.lower())
        if len(token) > 2
        and token not in {
            "for",
            "and",
            "the",
            "with",
            "that",
            "this",
            "app",
            "startup",
            "platform",
            "using",
            "from",
            "into",
        }
    }


def token_prefilter(rows: pd.DataFrame, text_column: str, idea: str, max_rows: int = 120) -> pd.DataFrame:
    if rows.empty or text_column not in rows.columns:
        return rows

    query_tokens = keyword_tokens(idea)
    if not query_tokens:
        return rows.head(max_rows)

    scored = rows.copy()
    scored["_token_hits"] = scored[text_column].fillna("").astype(str).map(
        lambda text: len(query_tokens.intersection(keyword_tokens(text)))
    )
    picked = scored[scored["_token_hits"] > 0].sort_values("_token_hits", ascending=False).head(max_rows)
    if picked.empty:
        picked = scored.head(max_rows)
    return picked.drop(columns=["_token_hits"], errors="ignore")


def generic_records_from_csv(path: Path) -> pd.DataFrame:
    cache_key = str(path)
    if cache_key in _GENERIC_CSV_CACHE:
        return _GENERIC_CSV_CACHE[cache_key]

    df = pd.read_csv(path, low_memory=False, nrows=1600)
    columns = {c.lower().strip(): c for c in df.columns}

    def first(*names: str) -> str | None:
        for name in names:
            if name.lower() in columns:
                return columns[name.lower()]
        return None

    name_col = first("company_name", "name", "company", "Company_Name", "Company")
    desc_col = first("long_description", "company_description", "description", "one_liner", "Use_Case")
    sector_col = first("industry", "industries", "subindustry", "industry_2", "Industry", "category_list")
    status_col = first("status", "stage", "Company_Type")
    batch_col = first("batch", "batch_name", "Year")
    url_col = first("website", "company_url", "Website")

    if not name_col:
        return pd.DataFrame()

    rows = []
    for _, row in df.iterrows():
        name = clean_text(row.get(name_col))
        if not name:
            continue
        desc = clean_text(row.get(desc_col)) if desc_col else ""
        sector = clean_text(row.get(sector_col)) if sector_col else ""
        status = clean_text(row.get(status_col)) if status_col else "reference"
        batch = clean_text(row.get(batch_col)) if batch_col else ""
        url = clean_text(row.get(url_col)) if url_col else ""
        evidence = " ".join([name, desc, sector, status, batch])
        rows.append(
            {
                "name": name,
                "sector": sector or "unknown",
                "description": desc,
                "status": status,
                "batch": batch,
                "url": url,
                "source_file": path.name,
                "search_text": evidence,
            }
        )
    result = pd.DataFrame(rows)
    _GENERIC_CSV_CACHE[cache_key] = result
    return result


def retrieve_reference_matches(idea: str, sector_group: str, limit: int = 6) -> list[dict]:
    frames = []
    idea_tokens = keyword_tokens(idea)
    for file_name in EXTRA_DATASET_FILES:
        path = DATA_DIR / file_name
        if not path.exists():
            continue
        frame = generic_records_from_csv(path)
        if frame.empty:
            continue
        frame["_token_hits"] = frame["search_text"].fillna("").astype(str).str.lower().map(
            lambda text: len(idea_tokens.intersection(keyword_tokens(text)))
        )
        if sector_group == "pet_care":
            pet_terms = {"pet", "pets", "dog", "dogs", "cat", "cats", "vet", "veterinary", "animal"}
            frame["_token_hits"] = frame["_token_hits"] + frame["search_text"].fillna("").astype(str).str.lower().map(
                lambda text: 4 if pet_terms.intersection(keyword_tokens(text)) else 0
            )
        narrowed = frame[
            (frame["_token_hits"] > 0)
            | frame["search_text"].fillna("").str.lower().str.contains(sector_group.replace("_", " "), regex=False)
        ].copy()
        if len(narrowed) > 120:
            narrowed = narrowed.sort_values("_token_hits", ascending=False).head(120)
        if not narrowed.empty:
            frames.append(narrowed)

    if not frames:
        return []

    candidates = pd.concat(frames, ignore_index=True)
    nearest = nearest_rows(idea, candidates, "search_text", limit=limit)
    refs = []
    for _, row in nearest.iterrows():
        refs.append(
            {
                "name": clean_text(row.get("name")),
                "sector": clean_text(row.get("sector")),
                "description": clean_text(row.get("description")),
                "status": clean_text(row.get("status")),
                "batch": clean_text(row.get("batch")),
                "url": clean_text(row.get("url")),
                "sourceFile": clean_text(row.get("source_file")),
                "similarity": round(float(row.get("similarity") or 0), 3),
                "similarityMethod": clean_text(row.get("similarity_method")),
            }
        )
    return refs


def find_comparables(idea: str, features: dict) -> dict:
    sector_group = features["sector_group"]
    global _FINAL_DATA_CACHE

    if _FINAL_DATA_CACHE is None:
        final_path = DATA_DIR / "final_training_data_v2.csv"
        failures_path = DATA_DIR / "master_failure_dataset.csv"
        final_df = pd.read_csv(final_path)
        failure_df = pd.read_csv(failures_path)

        final_df["sector_group"] = final_df["sector"].map(normalize_sector)
        success_df = final_df[final_df["target"] == 1].copy()
        failure_labeled_df = final_df[final_df["target"] == 0].copy()
        failure_df["sector_group"] = failure_df["Sector"].map(normalize_sector)
        _FINAL_DATA_CACHE = (success_df, failure_labeled_df, failure_df)
    else:
        success_df, failure_labeled_df, failure_df = _FINAL_DATA_CACHE

    sector_success = success_df[success_df["sector_group"] == sector_group].copy()
    sector_failure = failure_df[failure_df["sector_group"] == sector_group].copy()
    sector_failure_labeled = failure_labeled_df[failure_labeled_df["sector_group"] == sector_group]
    if len(sector_failure_labeled) < 5:
        sector_failure_labeled = token_prefilter(failure_labeled_df.copy(), "search_text", idea, max_rows=160) if "search_text" in failure_labeled_df.columns else failure_labeled_df

    if sector_success.empty:
        sector_success = success_df.copy()
    if sector_failure.empty:
        sector_failure = failure_df.copy()

    sector_success["search_text"] = (
        sector_success["company_name"].fillna("")
        + " "
        + sector_success["sector"].fillna("")
    )
    sector_failure["search_text"] = (
        sector_failure["Name"].fillna("")
        + " "
        + sector_failure["Sector"].fillna("")
        + " "
        + sector_failure["What They Did"].fillna("")
        + " "
        + sector_failure["Why They Failed"].fillna("")
        + " "
        + sector_failure["Takeaway"].fillna("")
    )

    if len(sector_success) < 5:
        all_success = success_df.copy()
        all_success["search_text"] = (
            all_success["company_name"].fillna("")
            + " "
            + all_success["sector"].fillna("")
        )
        sector_success = token_prefilter(all_success, "search_text", idea)

    if len(sector_failure) < 3:
        all_failure = failure_df.copy()
        all_failure["search_text"] = (
            all_failure["Name"].fillna("")
            + " "
            + all_failure["Sector"].fillna("")
            + " "
            + all_failure["What They Did"].fillna("")
            + " "
            + all_failure["Why They Failed"].fillna("")
            + " "
            + all_failure["Takeaway"].fillna("")
        )
        sector_failure = token_prefilter(all_failure, "search_text", idea)

    nearest_success = nearest_rows(idea, sector_success, "search_text")
    nearest_failure = nearest_rows(idea, sector_failure, "search_text")

    success_examples = []
    for _, row in nearest_success.iterrows():
        success_examples.append(
            {
                "name": clean_text(row.get("company_name")),
                "sector": clean_text(row.get("sector")),
                "funding": compact_money(row.get("funding_total_usd")),
                "companyAge": clean_age(row.get("company_age")),
                "similarity": round(float(row.get("similarity") or 0), 3),
                "similarityMethod": clean_text(row.get("similarity_method")),
            }
        )

    failure_examples = []
    for _, row in nearest_failure.iterrows():
        failure_examples.append(
            {
                "name": clean_text(row.get("Name")),
                "sector": clean_text(row.get("Sector")),
                "whatTheyDid": clean_text(row.get("What They Did")),
                "funding": clean_text(row.get("How Much They Raised")),
                "whyFailed": clean_text(row.get("Why They Failed")),
                "takeaway": clean_text(row.get("Takeaway")),
                "similarity": round(float(row.get("similarity") or 0), 3),
                "similarityMethod": clean_text(row.get("similarity_method")),
            }
        )

    return {
        "sectorGroup": sector_group,
        "successfulMatches": success_examples,
        "failureMatches": failure_examples,
        "referenceMatches": retrieve_reference_matches(idea, sector_group),
        "sectorRiskPatterns": top_risk_patterns(sector_failure_labeled),
        "sampleSizes": {
            "successRows": int(len(sector_success)),
            "failureRows": int(len(sector_failure)),
        },
        "retrievalModel": success_examples[0]["similarityMethod"] if success_examples else "none",
    }


def predict(payload: dict) -> dict:
    model_path = Path(payload.get("model_path") or DEFAULT_MODEL)
    artifact_key = str(model_path)
    artifact = _ARTIFACT_CACHE.get(artifact_key)
    if artifact is None:
        artifact = joblib.load(model_path)
        _ARTIFACT_CACHE[artifact_key] = artifact
    model = artifact["model"]
    preprocessor = artifact["preprocessor"]
    threshold = float(artifact.get("threshold", 0.5))
    input_columns = artifact.get(
        "input_columns",
        ["funding_total_usd", "company_age", "sector_group", "funding_log1p"],
    )

    features = build_features(payload)
    row = pd.DataFrame([{column: features.get(column, np.nan) for column in input_columns}])
    transformed = preprocessor.transform(row)
    success_probability = float(model.predict_proba(transformed)[0][1])
    prediction = int(success_probability >= threshold)
    comparables = find_comparables(clean_text(payload.get("idea")), features)

    return {
        "prediction": prediction,
        "label": "success" if prediction == 1 else "failure",
        "successProbability": success_probability,
        "failureProbability": 1.0 - success_probability,
        "threshold": threshold,
        "features": features,
        "comparables": comparables,
        "modelPath": str(model_path),
    }


def main() -> None:
    if "--server" in sys.argv:
        for line in sys.stdin:
            try:
                payload = json.loads(line or "{}")
                print(json.dumps(predict(payload)), flush=True)
            except Exception as exc:
                print(json.dumps({"error": str(exc)}), flush=True)
        return

    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    print(json.dumps(predict(payload)))


if __name__ == "__main__":
    main()
