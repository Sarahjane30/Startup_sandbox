import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score
import joblib

# Load dataset
df = pd.read_csv("startup data.csv")

# Remove unnecessary columns
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

df = df.drop(columns=columns_to_drop, errors='ignore')

# Remove missing values
df = df.dropna()

# Encode categorical columns
label_encoders = {}

object_columns = df.select_dtypes(include=['object', 'string']).columns

for column in object_columns:
    le = LabelEncoder()
    df[column] = le.fit_transform(df[column].astype(str))
    label_encoders[column] = le

# Features
X = df.drop(columns=["status"])

# Target
y = df["status"]

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

# Create model
model = RandomForestClassifier(
    n_estimators=200,
    random_state=42
)

# Train model
model.fit(X_train, y_train)

# Predictions
predictions = model.predict(X_test)

# Accuracy
accuracy = accuracy_score(y_test, predictions)

print("\nModel Accuracy:", accuracy)

# Save model
joblib.dump(model, "startup_classifier.pkl")

# Save encoders
joblib.dump(label_encoders, "label_encoders.pkl")

# Save feature names
joblib.dump(X.columns.tolist(), "feature_names.pkl")

print("\nStartup classification model trained successfully!")