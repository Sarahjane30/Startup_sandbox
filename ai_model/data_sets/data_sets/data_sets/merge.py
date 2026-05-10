import pandas as pd

df = pd.read_csv('data_sets/big_startup_secsees_dataset.csv')

# Define the major industry keywords based on your output
sectors = {
    "Information": ["Software", "SaaS", "Mobile", "Enterprise Software", "Apps"],
    "Finance": ["Finance"],
    "Health Care": ["Health Care", "Biotechnology", "Health and Wellness"],
    "Retail": ["E-Commerce", "Advertising"],
    "Education": ["Education"]
}

for sector_name, keywords in sectors.items():
    # Create a filter that checks if any keyword is in the category_list
    mask = df['category_list'].str.contains('|'.join(keywords), case=False, na=False)
    df_sector = df[mask].copy()
    
    # Save the success-only slice
    filename = f"data_sets/success_{sector_name.lower().replace(' ', '_')}.csv"
    df_sector.to_csv(filename, index=False)
    print(f"Saved {len(df_sector)} success rows for {sector_name} to {filename}")