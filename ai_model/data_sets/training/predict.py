import pandas as pd
import joblib

# Load model and files
model = joblib.load("startup_classifier.pkl")
label_encoders = joblib.load("label_encoders.pkl")
feature_names = joblib.load("feature_names.pkl")

# Sample startup input
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

# Convert to dataframe
input_df = pd.DataFrame([new_startup])

# Encode categorical columns
for column in input_df.columns:
    if column in label_encoders:
        le = label_encoders[column]

        value = str(input_df[column][0])

        if value not in le.classes_:
            value = le.classes_[0]

        input_df[column] = le.transform([value])

# Ensure correct feature order
input_df = input_df[feature_names]

# Predict
prediction = model.predict(input_df)

# Decode prediction
status_encoder = label_encoders["status"]

predicted_status = status_encoder.inverse_transform(prediction)

print("\nPredicted Startup Status:", predicted_status[0])