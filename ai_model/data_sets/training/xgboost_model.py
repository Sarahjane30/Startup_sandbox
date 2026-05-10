import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score
)

from xgboost import XGBClassifier

# ==================================================
# LOAD DATASET
# ==================================================

df = pd.read_csv(
    "data_sets/startup_data.csv"
)

print("\n===================================")
print("STARTUP SANDBOX OPTIMIZED AI ENGINE")
print("===================================")

print("\nOriginal Dataset Shape:")
print(df.shape)

# ==================================================
# KEEP ONLY ACQUIRED + CLOSED
# ==================================================

df = df[
    df["status"].isin(
        ["acquired", "closed"]
    )
]

print("\nFiltered Dataset Shape:")
print(df.shape)

print("\nClass Distribution:\n")

print(
    df["status"].value_counts()
)

# ==================================================
# REMOVE LEAKAGE + USELESS COLUMNS
# ==================================================

columns_to_drop = [

    # unnecessary columns
    "Unnamed: 0",
    "Unnamed: 6",
    "name",
    "object_id",
    "id",
    "city",
    "state_code",
    "state_code.1",
    "zip_code",
    "latitude",
    "longitude",
    "closed_at",
    "first_funding_at",
    "last_funding_at",
    "labels",

    # leakage columns
    "age_last_funding_year",
    "age_last_milestone_year",
    "is_MA",
    "is_top500",

    # strong post-success indicators
    "has_roundC",
    "has_roundD"
]

df = df.drop(
    columns=columns_to_drop,
    errors="ignore"
)

# ==================================================
# HANDLE MISSING VALUES
# ==================================================

df = df.dropna()

# ==================================================
# REMOVE DUPLICATES
# ==================================================

df = df.drop_duplicates()

# ==================================================
# OUTLIER REMOVAL
# ==================================================

numeric_columns = [
    "funding_total_usd",
    "funding_rounds",
    "relationships",
    "milestones",
    "avg_participants"
]

for col in numeric_columns:

    if col in df.columns:

        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)

        iqr = q3 - q1

        lower_bound = q1 - (1.5 * iqr)
        upper_bound = q3 + (1.5 * iqr)

        df = df[
            (df[col] >= lower_bound)
            &
            (df[col] <= upper_bound)
        ]

print("\nDataset After Preprocessing:")
print(df.shape)

# ==================================================
# ENCODE CATEGORICAL FEATURES
# ==================================================

label_encoders = {}

object_columns = df.select_dtypes(
    include=["object", "string"]
).columns

for column in object_columns:

    if column != "status":

        le = LabelEncoder()

        df[column] = le.fit_transform(
            df[column].astype(str)
        )

        label_encoders[column] = le

# ==================================================
# ENCODE TARGET
# ==================================================

target_encoder = LabelEncoder()

df["status"] = target_encoder.fit_transform(
    df["status"]
)

label_encoders["status"] = target_encoder

# ==================================================
# FEATURES + TARGET
# ==================================================

X = df.drop(columns=["status"])

y = df["status"]

# ==================================================
# TRAIN TEST SPLIT
# ==================================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# ==================================================
# CLASS IMBALANCE HANDLING
# ==================================================

class_counts = y.value_counts()

scale_pos_weight = (
    class_counts.max() /
    class_counts.min()
)

print("\nScale Pos Weight:")
print(scale_pos_weight)

# ==================================================
# CREATE OPTIMIZED XGBOOST MODEL
# ==================================================

model = XGBClassifier(
    n_estimators=400,
    max_depth=5,
    learning_rate=0.03,
    subsample=0.8,
    colsample_bytree=0.8,
    gamma=1,
    min_child_weight=3,
    objective="binary:logistic",
    eval_metric="logloss",
    scale_pos_weight=scale_pos_weight,
    random_state=42,
    n_jobs=-1
)

# ==================================================
# TRAIN MODEL
# ==================================================

print("\nTraining Optimized XGBoost Model...\n")

model.fit(
    X_train,
    y_train
)

# ==================================================
# PREDICTIONS
# ==================================================

predictions = model.predict(X_test)

# ==================================================
# EVALUATION
# ==================================================

accuracy = accuracy_score(
    y_test,
    predictions
)

macro_f1 = f1_score(
    y_test,
    predictions,
    average="macro"
)

print("\n===================================")
print("FINAL MODEL RESULTS")
print("===================================")

print(f"\nAccuracy: {accuracy:.4f}")

print(f"\nMacro F1 Score: {macro_f1:.4f}")

print("\nClassification Report:\n")

print(
    classification_report(
        y_test,
        predictions
    )
)

print("\nConfusion Matrix:\n")

print(
    confusion_matrix(
        y_test,
        predictions
    )
)

# ==================================================
# FEATURE IMPORTANCE
# ==================================================

importance_df = pd.DataFrame({
    "Feature": X.columns,
    "Importance": model.feature_importances_
})

importance_df = importance_df.sort_values(
    by="Importance",
    ascending=False
)

print("\nTop Important Features:\n")

print(
    importance_df.head(10)
)

# ==================================================
# SAVE MODEL
# ==================================================

artifacts = {
    "model": model,
    "label_encoders": label_encoders,
    "feature_names": X.columns.tolist()
}

joblib.dump(
    artifacts,
    "optimized_xgboost_model.pkl"
)

print("\n===================================")
print("MODEL SAVED SUCCESSFULLY!")
print("===================================")

print("\nSaved File:")
print("optimized_xgboost_model.pkl")