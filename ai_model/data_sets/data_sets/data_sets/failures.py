import pandas as pd
import glob
import os

def consolidate_for_gan():
    # Load all your new sector-split success files
    success_files = glob.glob('data_sets/success_*.csv')
    # Your failure files
    failure_files = [
        'Startup Failures (Information Sector).csv',
        'Startup Failure (Finance and Insurance).csv',
        'Startup Failure (Health Care).csv',
        'Startup Failure (Retail Trade).csv',
        'india_startup_failures_815.csv'
    ]
    
    all_data = []
    
    # Process Successes
    for f in success_files:
        df = pd.read_csv(f)
        df['target'] = 1
        df = df.rename(columns={'name': 'company_name', 'category_list': 'sector'})
        all_data.append(df[['company_name', 'sector', 'funding_total_usd', 'target']])
    
    # Process Failures
    for f in failure_files:
        path = os.path.join('data_sets', f)
        if os.path.exists(path):
            df = pd.read_csv(path)
            df['target'] = 0
            # Standardize based on your previous cleaning logic
            df = df.rename(columns={'Name': 'company_name', 'Sector': 'sector', 'How Much They Raised': 'funding_total_usd'})
            all_data.append(df[['company_name', 'sector', 'funding_total_usd', 'target']])
            
    master_df = pd.concat(all_data, ignore_index=True)
    master_df.to_csv('data_sets/pre_gan_master.csv', index=False)
    print(f"Master file ready for GAN: {master_df['target'].value_counts().to_dict()}")

consolidate_for_gan()