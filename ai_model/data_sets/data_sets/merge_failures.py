import pandas as pd
import glob

print("\n===================================")
print("MERGING FAILURE DATASETS")
print("===================================")

# ==========================================
# FIND ALL FAILURE FILES
# ==========================================

failure_files = glob.glob(
    "data_sets/Startup Failure*.csv"
)

print("\nFiles Found:\n")

for file in failure_files:
    print(file)

# ==========================================
# LOAD + MERGE
# ==========================================

all_failures = []

for file in failure_files:

    df = pd.read_csv(file)

    # add source sector
    df["source_file"] = file

    all_failures.append(df)

# ==========================================
# COMBINE EVERYTHING
# ==========================================

merged_df = pd.concat(
    all_failures,
    ignore_index=True
)

# ==========================================
# REMOVE DUPLICATES
# ==========================================

merged_df = merged_df.drop_duplicates()

# ==========================================
# SAVE MASTER FAILURE FILE
# ==========================================

merged_df.to_csv(
    "data_sets/master_failure_dataset.csv",
    index=False
)

# ==========================================
# FINAL OUTPUT
# ==========================================

print("\n===================================")
print("MERGE COMPLETE")
print("===================================")

print("\nFinal Dataset Shape:")

print(merged_df.shape)

print("\nColumns:\n")

print(merged_df.columns.tolist())

print("\nSaved File:")

print("data_sets/master_failure_dataset.csv")