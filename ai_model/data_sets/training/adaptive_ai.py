import pandas as pd
import joblib
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score

# ----------------------------------------
# LOAD DATASET
# ----------------------------------------

df = pd.read_csv("cleaned_startup data.csv")

# ----------------------------------------
# REMOVE UNUSED COLUMNS
# ----------------------------------------

columns_to_drop = [
    "Unnamed: 0",
    "Unnamed: 6",
    "name",
    "object_id",
    "city",
    "state_code",
    "state_code.1",
    "zip_code",
    "latitude",
    "longitude",
    "closed_at",
    "first_funding_at",
    "last_funding_at"
]

df = df.drop(columns=columns_to_drop, errors="ignore")

# ----------------------------------------
# REMOVE MISSING VALUES
# ----------------------------------------

df = df.dropna()

# ----------------------------------------
# ENCODE TEXT COLUMNS
# ----------------------------------------

label_encoders = {}

object_columns = df.select_dtypes(
    include=["object", "string"]
).columns

for column in object_columns:

    le = LabelEncoder()

    df[column] = le.fit_transform(
        df[column].astype(str)
    )

    label_encoders[column] = le

# ----------------------------------------
# FEATURES + TARGET
# ----------------------------------------

X = df.drop(columns=["status"])

y = df["status"]

# Save feature names
feature_names = X.columns.tolist()

# ----------------------------------------
# TRAIN TEST SPLIT
# ----------------------------------------

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

# ----------------------------------------
# CREATE SGD MODEL
# ----------------------------------------

model = SGDClassifier(
    loss="log_loss",
    max_iter=1000,
    random_state=42
)

# ----------------------------------------
# TRAIN MODEL
# ----------------------------------------

model.fit(X_train, y_train)

# ----------------------------------------
# EVALUATE MODEL
# ----------------------------------------

predictions = model.predict(X_test)

accuracy = accuracy_score(
    y_test,
    predictions
)

print("\nAdaptive AI Accuracy:", accuracy)

# ----------------------------------------
# SAVE MODEL FILES
# ----------------------------------------

joblib.dump(
    model,
    "adaptive_model.pkl"
)

joblib.dump(
    label_encoders,
    "adaptive_encoders.pkl"
)

joblib.dump(
    feature_names,
    "adaptive_features.pkl"
)

print("\nAdaptive AI model saved successfully!")

# ----------------------------------------
# SAMPLE STARTUP INPUT
# ----------------------------------------

new_startup = {
    "id": "c:99999",
    "labels": 1,
    "founded_at": "1/1/2020",
    "age_first_funding_year": 1.5,
    "age_last_funding_year": 2.0,
    "age_first_milestone_year": 2.5,
    "age_last_milestone_year": 3.0,
    "relationships": 5,
    "funding_rounds": 2,
    "funding_total_usd": 5000000,
    "milestones": 3,
    "category_code": "software",
    "is_CA": 0,
    "is_NY": 0,
    "is_MA": 0,
    "is_TX": 0,
    "is_otherstate": 1,
    "is_software": 1,
    "is_web": 1,
    "is_mobile": 0,
    "is_enterprise": 0,
    "is_advertising": 0,
    "is_gamesvideo": 0,
    "is_ecommerce": 0,
    "is_biotech": 0,
    "is_consulting": 0,
    "is_othercategory": 0,
    "has_VC": 1,
    "has_angel": 1,
    "has_roundA": 1,
    "has_roundB": 0,
    "has_roundC": 0,
    "has_roundD": 0,
    "avg_participants": 3.5,
    "is_top500": 0
}

# ----------------------------------------
# CONVERT INPUT
# ----------------------------------------

input_df = pd.DataFrame([new_startup])

# Encode input
for column in input_df.columns:

    if column in label_encoders:

        le = label_encoders[column]

        value = str(input_df[column][0])

        if value not in le.classes_:
            value = le.classes_[0]

        input_df[column] = le.transform([value])

# Ensure feature order
input_df = input_df[feature_names]

# ----------------------------------------
# MAKE PREDICTION
# ----------------------------------------

prediction = model.predict(input_df)

status_encoder = label_encoders["status"]

predicted_status = status_encoder.inverse_transform(
    prediction
)

# ----------------------------------------
# CONFIDENCE SCORES
# ----------------------------------------

probabilities = model.predict_proba(input_df)[0]

classes = status_encoder.inverse_transform(
    np.arange(len(probabilities))
)

print("\nPredicted Startup Status:")
print(predicted_status[0])

print("\nPrediction Confidence:\n")

for cls, prob in zip(classes, probabilities):

    print(
        f"{cls}: {round(prob * 100, 2)}%"
    )
