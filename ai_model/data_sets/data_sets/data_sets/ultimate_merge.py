import pandas as pd
import numpy as np

# =========================================================
# STARTUP SANDBOX ULTIMATE DATA MERGER
# =========================================================

print("\n================================================")
print("STARTUP SANDBOX ULTIMATE DATA MERGER")
print("================================================")

# =========================================================
# LOAD EXISTING HYBRID DATASET
# =========================================================

print("\nLoading Existing Hybrid Dataset...")

df_sandbox = pd.read_csv(
    'data_sets/final_training_data_v2.csv'
)

print("\nExisting Dataset Shape:")
print(df_sandbox.shape)

# =========================================================
# LOAD NEW 5000 ROW DATASET
# =========================================================

print("\nLoading New Behavioral Dataset...")

df_new = pd.read_csv(
    'data_sets/startup_failure_prediction.csv'
)

print("\nNew Dataset Shape:")
print(df_new.shape)

print("\nNew Dataset Columns:\n")

print(df_new.columns.tolist())

# =========================================================
# COLUMN MAPPING
# =========================================================

mapping = {

    'Startup_Name': 'company_name',

    'Industry': 'sector',

    'Funding_Amount': 'funding_total_usd',

    'Startup_Age': 'company_age',

    'Startup_Status': 'target'
}

df_new = df_new.rename(
    columns=mapping
)

# =========================================================
# CLEAN TARGET COLUMN
# =========================================================

df_new['target'] = (
    df_new['target']
    .replace({
        'Success': 1,
        'Failure': 0,
        'success': 1,
        'failure': 0,
        'Acquired': 1,
        'Closed': 0,
        'acquired': 1,
        'closed': 0
    })
)

# =========================================================
# CONVERT TARGET TO NUMERIC
# =========================================================

df_new['target'] = pd.to_numeric(
    df_new['target'],
    errors='coerce'
)

# =========================================================
# REMOVE INVALID TARGET ROWS
# =========================================================

df_new = df_new.dropna(
    subset=['target']
)

df_new['target'] = df_new['target'].astype(int)

print("\nBehavioral Dataset Target Distribution:\n")

print(
    df_new['target'].value_counts()
)

# =========================================================
# RISK COLUMNS
# =========================================================

risk_cols = [

    'Giants',

    'No Budget',

    'Competition',

    'Poor Market Fit',

    'Acquisition Stagnation',

    'Platform Dependency',

    'Monetization Failure',

    'Niche Limits',

    'Execution Flaws',

    'Trend Shifts',

    'Toxicity/Trust Issues',

    'Regulatory Pressure',

    'Overhype',

    'High Operational Costs'
]

# =========================================================
# ADD MISSING RISK COLUMNS
# =========================================================

for col in risk_cols:

    if col not in df_new.columns:

        df_new[col] = 0

# =========================================================
# REQUIRED CORE COLUMNS
# =========================================================

required_columns = [

    'company_name',

    'sector',

    'funding_total_usd',

    'company_age',

    'target'

] + risk_cols

# =========================================================
# ADD MISSING CORE COLUMNS
# =========================================================

for col in required_columns:

    if col not in df_new.columns:

        df_new[col] = 0

# =========================================================
# KEEP REQUIRED COLUMNS
# =========================================================

df_new = df_new[required_columns]

df_sandbox = df_sandbox[required_columns]

# =========================================================
# MERGE DATASETS
# =========================================================

print("\nMerging Datasets...")

df_ultimate = pd.concat(
    [df_sandbox, df_new],
    axis=0,
    ignore_index=True
)

# =========================================================
# REMOVE DUPLICATES
# =========================================================

df_ultimate = df_ultimate.drop_duplicates()

# =========================================================
# HANDLE MISSING VALUES
# =========================================================

df_ultimate = df_ultimate.fillna(0)

# =========================================================
# OPTIONAL BEHAVIORAL FEATURES
# =========================================================

behavioral_cols = [

    'Burn_Rate',

    'Revenue',

    'Founder_Experience',

    'Employees_Count',

    'Product_Uniqueness_Score'
]

for col in behavioral_cols:

    if col in df_ultimate.columns:

        median_val = df_ultimate[col].median()

        df_ultimate[col] = (
            df_ultimate[col]
            .fillna(median_val)
        )

# =========================================================
# FINAL OUTPUT
# =========================================================

print("\n================================================")
print("FINAL DATASET CREATED")
print("================================================")

print("\nFinal Shape:")
print(df_ultimate.shape)

print("\nTarget Distribution:\n")

print(
    df_ultimate['target'].value_counts()
)

print("\nColumns:\n")

print(df_ultimate.columns.tolist())

# =========================================================
# SAVE DATASET
# =========================================================

df_ultimate.to_csv(
    'data_sets/ultimate_startup_dataset_v3.csv',
    index=False
)

print("\nSaved File:")
print("data_sets/ultimate_startup_dataset_v3.csv")

print("\nUltimate Merge Complete!")