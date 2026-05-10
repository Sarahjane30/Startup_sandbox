from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from ctgan import CTGAN
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data_sets"
DEFAULT_DATASET = DATA_DIR / "final_training_data_v2.csv"
DEFAULT_MODEL = ROOT / "models" / "optimized_hybrid_xgboost_model.pkl"
DEFAULT_REPORT = ROOT / "models" / "optimized_hybrid_xgboost_report.json"
DEFAULT_IMPORTANCE = ROOT / "models" / "optimized_hybrid_xgboost_importance.csv"

RISK_COLUMNS = [
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train an optimized, imbalance-aware XGBoost startup success model."
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--model-out", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report-out", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--importance-out", type=Path, default=DEFAULT_IMPORTANCE)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--minority-ratio",
        type=float,
        default=0.75,
        help="GAN-generated minority size as a fraction of the majority class.",
    )
    parser.add_argument(
        "--gan-epochs",
        type=int,
        default=300,
        help="CTGAN training epochs. Increase for quality, decrease for speed.",
    )
    parser.add_argument(
        "--drop-risk-features",
        action="store_true",
        help="Drop post-failure risk columns for a stricter no-leakage experiment. Enabled by default.",
    )
    parser.add_argument(
        "--include-risk-features",
        action="store_false",
        dest="drop_risk_features",
        help="Include post-failure risk columns. This may leak target information.",
    )
    parser.add_argument(
        "--keep-raw-sector",
        action="store_false",
        dest="drop_raw_sector",
        help="Keep the original sector string. This can leak dataset source, so it is dropped by default.",
    )
    parser.add_argument(
        "--drop-funding-features",
        action="store_true",
        help="Drop funding columns for a harsher stress test.",
    )
    parser.add_argument(
        "--drop-age-feature",
        action="store_true",
        help="Drop company_age for a harsher stress test.",
    )
    parser.set_defaults(drop_risk_features=True)
    parser.set_defaults(drop_raw_sector=True)
    return parser.parse_args()


def clean_sector(value: object) -> str:
    text = str(value or "unknown").strip().lower()
    if not text or text in {"0", "nan", "none"}:
        return "unknown"
    if "finance" in text or "fintech" in text or "insurance" in text:
        return "finance"
    if "health" in text or "medical" in text or "bio" in text or "pharma" in text:
        return "health_care"
    if "education" in text or "edtech" in text:
        return "education"
    if "retail" in text or "commerce" in text or "shopping" in text:
        return "retail"
    if "food" in text or "restaurant" in text or "hospitality" in text:
        return "food_services"
    if "manufact" in text or "hardware" in text or "industrial" in text:
        return "manufacturing"
    if "software" in text or "web" in text or "internet" in text or "mobile" in text:
        return "information"
    return text.split("|")[0].strip().replace(" ", "_")[:40]


def load_dataset(
    path: Path,
    drop_risk_features: bool,
    drop_raw_sector: bool,
    drop_funding_features: bool,
    drop_age_feature: bool,
) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(path)
    if "target" not in df.columns:
        raise ValueError(f"{path} must contain a target column.")

    df = df.drop_duplicates().copy()
    df["target"] = pd.to_numeric(df["target"], errors="coerce")
    df = df[df["target"].isin([0, 1])]

    if "sector" in df.columns:
        df["sector_group"] = df["sector"].map(clean_sector)
    else:
        df["sector_group"] = "unknown"

    if "funding_total_usd" in df.columns:
        df["funding_total_usd"] = pd.to_numeric(df["funding_total_usd"], errors="coerce").fillna(0)
        df["funding_log1p"] = np.log1p(df["funding_total_usd"].clip(lower=0))

    if "company_age" in df.columns:
        df["company_age"] = pd.to_numeric(df["company_age"], errors="coerce")
        df["company_age"] = df["company_age"].clip(lower=0, upper=100)

    for col in RISK_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).clip(0, 1)

    y = df["target"].astype(int)
    X = df.drop(columns=["target", "company_name"], errors="ignore")

    if drop_risk_features:
        X = X.drop(columns=RISK_COLUMNS, errors="ignore")

    if drop_raw_sector:
        X = X.drop(columns=["sector"], errors="ignore")

    if drop_funding_features:
        X = X.drop(columns=["funding_total_usd", "funding_log1p"], errors="ignore")

    if drop_age_feature:
        X = X.drop(columns=["company_age"], errors="ignore")

    return X, y


def make_preprocessor(X: pd.DataFrame) -> ColumnTransformer:
    categorical = X.select_dtypes(include=["object", "string", "category"]).columns.tolist()
    numeric = [c for c in X.columns if c not in categorical]

    try:
        one_hot = OneHotEncoder(handle_unknown="ignore", sparse_output=False, min_frequency=3)
    except TypeError:
        one_hot = OneHotEncoder(handle_unknown="ignore", sparse=False)

    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric,
            ),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", one_hot),
                    ]
                ),
                categorical,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def synthesize_minority_with_ctgan(
    X: pd.DataFrame,
    y: pd.Series,
    target_ratio: float,
    seed: int,
    epochs: int,
) -> tuple[pd.DataFrame, pd.Series, dict]:
    y_arr = np.asarray(y)
    classes, counts = np.unique(y_arr, return_counts=True)
    if len(classes) != 2:
        return X, y, {"method": "none", "reason": "not binary"}

    minority = classes[np.argmin(counts)]
    majority_count = int(counts.max())
    minority_count = int(counts.min())
    desired_minority = int(majority_count * target_ratio)
    needed = max(0, desired_minority - minority_count)
    if needed == 0:
        return X, y, {"method": "none", "reason": "already balanced"}

    minority_X = X.loc[y == minority].copy()
    categorical_columns = minority_X.select_dtypes(
        include=["object", "string", "category"]
    ).columns.tolist()

    gan = CTGAN(
        epochs=epochs,
        batch_size=64,
        generator_dim=(128, 128),
        discriminator_dim=(128, 128),
        pac=1,
        verbose=False,
        enable_gpu=False,
    )
    gan.fit(minority_X, discrete_columns=categorical_columns)
    synthetic_X = gan.sample(needed)

    for col in X.columns:
        if col not in synthetic_X.columns:
            synthetic_X[col] = np.nan
    synthetic_X = synthetic_X[X.columns]

    balanced_X = pd.concat([X, synthetic_X], ignore_index=True)
    balanced_y = pd.concat(
        [y.reset_index(drop=True), pd.Series([int(minority)] * needed)],
        ignore_index=True,
    )
    order = np.random.default_rng(seed).permutation(len(balanced_y))
    return (
        balanced_X.iloc[order].reset_index(drop=True),
        balanced_y.iloc[order].reset_index(drop=True),
        {
        "method": "ctgan",
        "minority_class": int(minority),
        "original_minority_count": minority_count,
        "synthetic_rows": int(needed),
        "target_minority_ratio": target_ratio,
        "gan_epochs": int(epochs),
        "discrete_columns": categorical_columns,
        "note": "CTGAN was trained only on the training split's minority class; validation and test data were untouched.",
        },
    )


def candidate_models(class_ratio: float, seed: int) -> list[tuple[str, XGBClassifier]]:
    base = {
        "objective": "binary:logistic",
        "eval_metric": "logloss",
        "tree_method": "hist",
        "random_state": seed,
        "n_jobs": -1,
    }
    return [
        (
            "balanced_generalist",
            XGBClassifier(
                **base,
                n_estimators=500,
                max_depth=4,
                learning_rate=0.035,
                subsample=0.9,
                colsample_bytree=0.85,
                min_child_weight=2,
                gamma=0.3,
                reg_alpha=0.05,
                reg_lambda=1.2,
                scale_pos_weight=class_ratio,
            ),
        ),
        (
            "high_recall_failure",
            XGBClassifier(
                **base,
                n_estimators=650,
                max_depth=3,
                learning_rate=0.025,
                subsample=0.85,
                colsample_bytree=0.8,
                min_child_weight=1,
                gamma=0.1,
                reg_alpha=0.1,
                reg_lambda=1.6,
                scale_pos_weight=class_ratio,
            ),
        ),
        (
            "deeper_interactions",
            XGBClassifier(
                **base,
                n_estimators=450,
                max_depth=5,
                learning_rate=0.04,
                subsample=0.8,
                colsample_bytree=0.9,
                min_child_weight=3,
                gamma=0.7,
                reg_alpha=0.0,
                reg_lambda=1.0,
                scale_pos_weight=class_ratio,
            ),
        ),
    ]


def best_threshold(y_true: np.ndarray, probabilities: np.ndarray) -> tuple[float, dict]:
    best = (0.5, -1.0, {})
    for threshold in np.linspace(0.15, 0.85, 71):
        preds = (probabilities >= threshold).astype(int)
        macro_f1 = f1_score(y_true, preds, average="macro")
        balanced = balanced_accuracy_score(y_true, preds)
        score = (macro_f1 * 0.65) + (balanced * 0.35)
        if score > best[1]:
            best = (
                float(threshold),
                float(score),
                {
                    "macro_f1": float(macro_f1),
                    "balanced_accuracy": float(balanced),
                },
            )
    return best[0], best[2]


def metrics(y_true: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    preds = (probabilities >= threshold).astype(int)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        preds,
        labels=[0, 1],
        zero_division=0,
    )
    return {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y_true, preds)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, preds)),
        "macro_f1": float(f1_score(y_true, preds, average="macro")),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "confusion_matrix": confusion_matrix(y_true, preds).tolist(),
        "class_metrics": {
            "failure_0": {
                "precision": float(precision[0]),
                "recall": float(recall[0]),
                "f1": float(f1[0]),
                "support": int(support[0]),
            },
            "success_1": {
                "precision": float(precision[1]),
                "recall": float(recall[1]),
                "f1": float(f1[1]),
                "support": int(support[1]),
            },
        },
        "classification_report": classification_report(y_true, preds, zero_division=0),
    }


def main() -> None:
    args = parse_args()
    X, y = load_dataset(
        args.dataset,
        args.drop_risk_features,
        args.drop_raw_sector,
        args.drop_funding_features,
        args.drop_age_feature,
    )

    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=args.seed,
        stratify=y,
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val,
        y_train_val,
        test_size=0.2,
        random_state=args.seed,
        stratify=y_train_val,
    )

    class_counts = y_train.value_counts().to_dict()
    majority = max(class_counts.values())
    minority = min(class_counts.values())
    imbalance_ratio = majority / minority
    X_balanced, y_balanced, balance_info = synthesize_minority_with_ctgan(
        X_train,
        y_train,
        target_ratio=args.minority_ratio,
        seed=args.seed,
        epochs=args.gan_epochs,
    )

    preprocessor = make_preprocessor(X_balanced)
    X_train_t = preprocessor.fit_transform(X_balanced)
    X_val_t = preprocessor.transform(X_val)
    X_test_t = preprocessor.transform(X_test)

    best = None
    model_results = []
    for name, model in candidate_models(imbalance_ratio, args.seed):
        model.fit(X_train_t, y_balanced)
        val_prob = model.predict_proba(X_val_t)[:, 1]
        threshold, threshold_metrics = best_threshold(y_val.to_numpy(), val_prob)
        val_metrics = metrics(y_val.to_numpy(), val_prob, threshold)
        selection_score = (val_metrics["macro_f1"] * 0.65) + (
            val_metrics["balanced_accuracy"] * 0.35
        )
        record = {
            "name": name,
            "threshold": threshold,
            "selection_score": float(selection_score),
            "threshold_search": threshold_metrics,
            "validation": val_metrics,
        }
        model_results.append(record)
        if best is None or selection_score > best["selection_score"]:
            best = {
                "name": name,
                "model": model,
                "threshold": threshold,
                "selection_score": float(selection_score),
                "validation": val_metrics,
            }

    test_prob = best["model"].predict_proba(X_test_t)[:, 1]
    test_metrics = metrics(y_test.to_numpy(), test_prob, best["threshold"])

    feature_names = preprocessor.get_feature_names_out().tolist()
    importance_df = pd.DataFrame(
        {
            "feature": feature_names,
            "importance": best["model"].feature_importances_,
        }
    ).sort_values("importance", ascending=False)

    report = {
        "dataset": str(args.dataset),
        "rows": int(len(X)),
        "columns": X.columns.tolist(),
        "target_distribution": {str(k): int(v) for k, v in y.value_counts().to_dict().items()},
        "drop_risk_features": bool(args.drop_risk_features),
        "drop_raw_sector": bool(args.drop_raw_sector),
        "drop_funding_features": bool(args.drop_funding_features),
        "drop_age_feature": bool(args.drop_age_feature),
        "train_distribution": {str(k): int(v) for k, v in class_counts.items()},
        "imbalance_ratio": float(imbalance_ratio),
        "balance": balance_info,
        "selected_model": best["name"],
        "validation": best["validation"],
        "test": test_metrics,
        "candidate_models": model_results,
        "top_features": importance_df.head(20).to_dict(orient="records"),
    }

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.importance_out.parent.mkdir(parents=True, exist_ok=True)

    artifact = {
        "model": best["model"],
        "preprocessor": preprocessor,
        "threshold": best["threshold"],
        "feature_names": feature_names,
        "input_columns": X.columns.tolist(),
        "metrics": report,
    }
    joblib.dump(artifact, args.model_out)
    args.report_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    importance_df.to_csv(args.importance_out, index=False)

    print("\n================================================")
    print("OPTIMIZED HYBRID XGBOOST RESULTS")
    print("================================================")
    print(f"Dataset: {args.dataset}")
    print(f"Rows: {len(X):,}")
    print(f"Target distribution: {report['target_distribution']}")
    print(f"Balancing: {balance_info}")
    print(f"Selected model: {best['name']}")
    print(f"Threshold: {best['threshold']:.2f}")
    print("\nTest metrics:")
    for key in ["accuracy", "balanced_accuracy", "macro_f1", "roc_auc"]:
        print(f"  {key}: {test_metrics[key]:.4f}")
    print("\nFailure class metrics:")
    failure = test_metrics["class_metrics"]["failure_0"]
    print(f"  precision: {failure['precision']:.4f}")
    print(f"  recall: {failure['recall']:.4f}")
    print(f"  f1: {failure['f1']:.4f}")
    print("\nConfusion matrix [[failure, success], [failure, success]]:")
    print(test_metrics["confusion_matrix"])
    print(f"\nSaved model: {args.model_out}")
    print(f"Saved report: {args.report_out}")
    print(f"Saved importance: {args.importance_out}")


if __name__ == "__main__":
    main()
