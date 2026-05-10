import pandas as pd
import joblib
import matplotlib.pyplot as plt
import numpy as np

# Load SGD model
model = joblib.load("adaptive_model.pkl")

# Load feature names
feature_names = joblib.load("adaptive_features.pkl")

# Get coefficients
coefficients = model.coef_[0]

# Create dataframe
importance_df = pd.DataFrame({
    "Feature": feature_names,
    "Importance": np.abs(coefficients)
})

# Sort by importance
importance_df = importance_df.sort_values(
    by="Importance",
    ascending=False
)

# Print results
print("\nTOP FEATURES INFLUENCING SGD MODEL:\n")

print(importance_df.head(10))

# Plot graph
plt.figure(figsize=(12, 6))

plt.bar(
    importance_df["Feature"][:10],
    importance_df["Importance"][:10]
)

plt.xticks(rotation=45)

plt.title("Startup Sandbox Explainable AI (SGD Model)")

plt.xlabel("Features")

plt.ylabel("Coefficient Importance")

plt.tight_layout()

# Save graph
plt.savefig("sgd_feature_importance.png")

print(
    "\nGraph saved as sgd_feature_importance.png"
)