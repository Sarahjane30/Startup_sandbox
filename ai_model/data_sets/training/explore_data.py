import pandas as pd

df = pd.read_csv("global_startup_success_dataset.csv")

print(df.head())

print("\nColumns:")
print(df.columns)

print("\nMissing Values:")
print(df.isnull().sum())

print("\nDataset Info:")
print(df.info())