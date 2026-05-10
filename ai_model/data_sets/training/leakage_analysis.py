import pandas as pd

# Load dataset
df = pd.read_csv("cleaned_startup_data.csv")

print("\n====================================")
print("STARTUP SANDBOX LEAKAGE ANALYSIS")
print("====================================")

# Potential leakage columns
suspicious_columns = [
    "labels",
    "age_last_funding_year",
    "age_last_milestone_year",
    "relationships",
    "milestones"
]

print("\nPotential Leakage Features:\n")

for col in suspicious_columns:

    if col in df.columns:

        print(f"⚠ {col}")

print("\n====================================")

print("""
Leakage Explanation:

These features may contain information
generated AFTER startup success/failure.

Using them may artificially inflate
model accuracy and reduce real-world
generalization capability.
""")