import pandas as pd
import re

# =========================================================
# STARTUP SANDBOX DATA INTEGRATION ENGINE
# =========================================================

print("\n================================================")
print("STARTUP SANDBOX DATA INTEGRATION")
print("================================================")

# =========================================================
# HELPER FUNCTIONS
# =========================================================

def clean_currency(value):

    """
    Converts:
    $15M -> 15000000
    $2.5B -> 2500000000
    """

    if pd.isna(value) or str(value).strip() == "":
        return 0

    value = (
        str(value)
        .replace("$", "")
        .replace(",", "")
        .upper()
        .strip()
    )

    multiplier = 1

    if "B" in value:
        multiplier = 1_000_000_000

    elif "M" in value:
        multiplier = 1_000_000

    elif "K" in value:
        multiplier = 1_000

    numbers = re.findall(
        r"[-+]?\d*\.\d+|\d+",
        value
    )

    if len(numbers) == 0:
        return 0

    return float(numbers[0]) * multiplier


def extract_age_fail(value):

    """
    Converts:
    6 (2015-2021) -> 6
    """

    if pd.isna(value):
        return 0

    match = re.search(
        r'^(\d+)',
        str(value)
    )

    return int(match.group(1)) if match else 0


def extract_year(date_value):

    """
    Extracts year from:
    2015-01-05 -> 2015
    """

    if pd.isna(date_value):
        return 0

    date_value = str(date_value)

    if len(date_value) >= 4 and date_value[:4].isdigit():

        return int(date_value[:4])

    return 0


# =========================================================
# LOAD SUCCESS DATASET
# =========================================================

print("\nLoading Success Dataset...")

df_succ = pd.read_csv(
    'data_sets/big_startup_secsees_dataset.csv'
)

print("\nOriginal Success Shape:")
print(df_succ.shape)

# =========================================================
# KEEP ONLY TRUE SUCCESS STARTUPS
# =========================================================

df_succ = df_succ[
    df_succ['status'].isin(
        ['acquired', 'ipo']
    )
]

print("\nFiltered Success Shape:")
print(df_succ.shape)

# =========================================================
# CREATE TARGET
# =========================================================

df_succ['target'] = 1

# =========================================================
# CLEAN FUNDING COLUMN
# =========================================================

df_succ['funding_total_usd'] = pd.to_numeric(
    df_succ['funding_total_usd'],
    errors='coerce'
).fillna(0)

# =========================================================
# CREATE COMPANY AGE
# =========================================================

df_succ['company_age'] = (
    2026 -
    df_succ['founded_at'].apply(
        extract_year
    )
)

# =========================================================
# RENAME COLUMNS
# =========================================================

df_succ = df_succ.rename(
    columns={
        'name': 'company_name',
        'category_list': 'sector'
    }
)

# =========================================================
# LOAD FAILURE DATASET
# =========================================================

print("\nLoading Failure Dataset...")

df_fail = pd.read_csv(
    'data_sets/master_failure_dataset.csv'
)

print("\nFailure Dataset Shape:")
print(df_fail.shape)

# =========================================================
# CREATE TARGET
# =========================================================

df_fail['target'] = 0

# =========================================================
# CLEAN FUNDING
# =========================================================

df_fail['funding_total_usd'] = (
    df_fail['How Much They Raised']
    .apply(clean_currency)
)

# =========================================================
# EXTRACT COMPANY AGE
# =========================================================

df_fail['company_age'] = (
    df_fail['Years of Operation']
    .apply(extract_age_fail)
)

# =========================================================
# RENAME COLUMNS
# =========================================================

df_fail = df_fail.rename(
    columns={
        'Name': 'company_name',
        'Sector': 'sector'
    }
)

# =========================================================
# RISK FEATURES
# =========================================================

risk_columns = [

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
# ADD RISK COLUMNS TO SUCCESS DATA
# =========================================================

for col in risk_columns:

    df_succ[col] = 0

# =========================================================
# SELECT FINAL COLUMNS
# =========================================================

core_cols = [

    'company_name',

    'sector',

    'funding_total_usd',

    'company_age',

    'target'

] + risk_columns

# =========================================================
# KEEP REQUIRED COLUMNS
# =========================================================

df_succ = df_succ[core_cols]

df_fail = df_fail[core_cols]

# =========================================================
# MERGE DATASETS
# =========================================================

df_final = pd.concat(
    [df_succ, df_fail],
    ignore_index=True
)

# =========================================================
# REMOVE DUPLICATES
# =========================================================

df_final = df_final.drop_duplicates()

# =========================================================
# HANDLE MISSING VALUES
# =========================================================

df_final = df_final.fillna(0)

# =========================================================
# FINAL OUTPUT
# =========================================================

print("\n================================================")
print("FINAL DATASET CREATED")
print("================================================")

print("\nFinal Shape:")
print(df_final.shape)

print("\nTarget Distribution:\n")

print(
    df_final['target'].value_counts()
)

print("\nColumns:\n")

print(df_final.columns.tolist())

# =========================================================
# SAVE FINAL DATASET
# =========================================================

df_final.to_csv(
    'data_sets/final_training_data_v2.csv',
    index=False
)

print("\nSaved File:")
print("data_sets/final_training_data_v2.csv")

print("\nIntegration Complete!")