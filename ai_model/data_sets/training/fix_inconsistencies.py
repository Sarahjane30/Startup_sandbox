import pandas as pd
import os

print("=" * 70)
print("STARTUP SANDBOX - DATASET CLEANING & STANDARDIZATION")
print("=" * 70)

# Get all CSV files in current directory
csv_files = [f for f in os.listdir('.') if f.endswith('.csv')]

# Dictionary to store variations
industry_variations = {}

# ---------------------------------------------------
# STEP 1: IDENTIFY INCONSISTENCIES
# ---------------------------------------------------

print("\nIDENTIFYING DATASET INCONSISTENCIES...\n")

for csv_file in csv_files:
    try:
        df = pd.read_csv(csv_file)

        # Columns to inspect
        columns_to_check = [
            "Industry",
            "SubVertical",
            "Industry Vertical",
            "City",
            "City  Location",
            "Investors Name"
        ]

        for column in columns_to_check:

            if column in df.columns:

                unique_values = df[column].dropna().unique()

                for value in unique_values:

                    normalized = (
                        str(value)
                        .strip()
                        .lower()
                        .replace("-", "")
                        .replace(" ", "")
                    )

                    if normalized not in industry_variations:
                        industry_variations[normalized] = []

                    if value not in industry_variations[normalized]:
                        industry_variations[normalized].append(value)

    except Exception as e:
        print(f"✗ Error reading {csv_file}: {e}")

# ---------------------------------------------------
# SHOW VARIATIONS
# ---------------------------------------------------

print("\nFOUND VARIATIONS:\n")

has_variations = False

for normalized, variations in sorted(industry_variations.items()):

    if len(variations) > 1:

        has_variations = True

        print(f"Normalized Key: '{normalized}'")
        print(f"Variations: {variations}\n")

if not has_variations:
    print("✓ No major inconsistencies found.")

# ---------------------------------------------------
# STANDARDIZATION MAP
# ---------------------------------------------------

standardization_map = {

    # Industry Standardization
    "ecommerce": "E-Commerce",
    "ecommercemarketplace": "E-Commerce",
    "retail": "Retail",
    "fintech": "FinTech",
    "edtech": "EdTech",
    "healthtech": "HealthTech",
    "agritech": "AgriTech",
    "foodtech": "FoodTech",
    "mobility": "Mobility",
    "logistics": "Logistics",
    "saas": "SaaS",
    "media": "Media",
    "consumerelectronics": "Consumer Electronics",
    "enterprise": "Enterprise",
    "realestate": "Real Estate",
    "tech": "Tech",
    "ai": "AI",
    "gaming": "Gaming",
    "energy": "Energy",
    "healthcare": "Healthcare",

    # City Standardization
    "bangalore": "Bengaluru",
    "bengaluru": "Bengaluru",
    "gurgaon": "Gurugram",
    "newdelhi": "New Delhi",

    # Investor Standardization
    "undisclosedinvestors": "Undisclosed Investors",
    "undisclosedinvestor": "Undisclosed Investors"
}

# ---------------------------------------------------
# STEP 2: CLEAN DATASETS
# ---------------------------------------------------

print("\n" + "=" * 70)
print("APPLYING DATA STANDARDIZATION")
print("=" * 70)

for csv_file in csv_files:

    try:
        df = pd.read_csv(csv_file)

        original_df = df.copy()

        columns_to_clean = [
            "Industry",
            "SubVertical",
            "Industry Vertical",
            "City",
            "City  Location",
            "Investors Name"
        ]

        for column in columns_to_clean:

            if column in df.columns:

                for idx, value in df[column].items():

                    if pd.notna(value):

                        normalized = (
                            str(value)
                            .strip()
                            .lower()
                            .replace("-", "")
                            .replace(" ", "")
                        )

                        if normalized in standardization_map:

                            df.loc[idx, column] = standardization_map[normalized]

        # Save cleaned dataset separately
        cleaned_name = f"cleaned_{csv_file}"

        df.to_csv(cleaned_name, index=False)

        # Check if modifications happened
        if not df.equals(original_df):
            print(f"✓ Cleaned & saved: {cleaned_name}")
        else:
            print(f"✓ No changes needed: {csv_file}")

    except Exception as e:
        print(f"✗ Error processing {csv_file}: {e}")

# ---------------------------------------------------
# COMPLETE
# ---------------------------------------------------

print("\n" + "=" * 70)
print("DATA STANDARDIZATION COMPLETE!")
print("=" * 70)

print("\nGenerated cleaned datasets:")
for csv_file in csv_files:
    print(f" - cleaned_{csv_file}")