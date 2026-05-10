import pandas as pd
import glob

# 1. Load the Success dataset
df_success = pd.read_csv('data_sets/big_startup_secsees_dataset.csv')

# 2. Get all your failure files
failure_files = glob.glob('data_sets/Startup Failure*.csv')

# 3. Find the Common Columns across ALL files
common_cols = set(df_success.columns)

for file in failure_files:
    temp_df = pd.read_csv(file, nrows=0) # Just load headers to be fast
    common_cols = common_cols.intersection(set(temp_df.columns))

common_cols = list(common_cols)
print(f"Found {len(common_cols)} matching columns: {common_cols}")
