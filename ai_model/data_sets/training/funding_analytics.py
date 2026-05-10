# Funding Analytics Layer for Startup Sandbox

## File: funding_analytics.py


import pandas as pd
import matplotlib.pyplot as plt

# Load dataset
# Change filename if needed

df = pd.read_csv("cleaned_startup_funding.csv")

# Clean column names

df.columns = df.columns.str.strip()
# -----------------------------
# DATA CLEANING
# -----------------------------

# Standardize city names
df["City  Location"] = df["City  Location"].replace({
    "Bangalore": "Bengaluru",
    "Gurgaon": "Gurugram"
})

# Standardize industry names
df["Industry Vertical"] = df["Industry Vertical"].replace({
    "Ecommerce": "E-Commerce",
    "eCommerce": "E-Commerce",
    "E-Commerce": "E-Commerce",
    "FinTech": "Fintech",
    "Technology": "Tech"
})

# Standardize investor names
df["Investors Name"] = df["Investors Name"].replace({
    "undisclosed investors": "Undisclosed Investors",
    "undisclosed investor": "Undisclosed Investors",
    "Undisclosed Investor": "Undisclosed Investors"
})

# Clean funding amount column

df["Amount in USD"] = (
    df["Amount in USD"]
    .astype(str)
    .str.replace(",", "", regex=False)
)

# Convert to numeric

df["Amount in USD"] = pd.to_numeric(
    df["Amount in USD"],
    errors="coerce"
)

# Remove missing values

df = df.dropna(subset=["Amount in USD"])

print("\nDATASET LOADED SUCCESSFULLY")
print(df.head())

# ---------------------------------------------------
# TOP FUNDED INDUSTRIES
# ---------------------------------------------------

industry_funding = (
    df.groupby("Industry Vertical")["Amount in USD"]
    .sum()
    .sort_values(ascending=False)
    .head(10)
)

print("\nTop Funded Industries:\n")
print(industry_funding)

# Plot chart
plt.figure(figsize=(10, 6))
industry_funding.plot(kind="bar")

plt.title("Top Funded Industries")
plt.xlabel("Industry")
plt.ylabel("Funding Amount (USD)")
plt.xticks(rotation=45)
plt.tight_layout()

plt.savefig("top_funded_industries.png")

print("\nChart saved as top_funded_industries.png")

# ---------------------------------------------------
# TOP STARTUP CITIES
# ---------------------------------------------------

city_funding = (
    df.groupby("City  Location")["Amount in USD"]
    .sum()
    .sort_values(ascending=False)
    .head(10)
)

print("\nTop Startup Cities:\n")
print(city_funding)

# Plot chart
plt.figure(figsize=(10, 6))
city_funding.plot(kind="bar")

plt.title("Top Startup Cities")
plt.xlabel("City")
plt.ylabel("Funding Amount (USD)")
plt.xticks(rotation=45)
plt.tight_layout()

plt.savefig("top_startup_cities.png")

print("\nChart saved as top_startup_cities.png")

# ---------------------------------------------------
# TOP INVESTORS
# ---------------------------------------------------

investor_counts = (
    df["Investors Name"]
    .value_counts()
    .head(10)
)

print("\nTop Investors:\n")
print(investor_counts)

# Plot chart
plt.figure(figsize=(10, 6))
investor_counts.plot(kind="bar")

plt.title("Most Active Investors")
plt.xlabel("Investor")
plt.ylabel("Number of Investments")
plt.xticks(rotation=45)
plt.tight_layout()

plt.savefig("top_investors.png")

print("\nChart saved as top_investors.png")

print("\nFunding analytics completed successfully!")
