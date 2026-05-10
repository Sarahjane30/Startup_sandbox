import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Load dataset
df = pd.read_csv("startups.csv")

# Keep useful columns
df = df[
    [
        "name",
        "industry",
        "description",
        "extended_description"
    ]
]

# Remove missing values
df = df.dropna()

# Combine text columns
df["combined_text"] = (
    df["industry"].astype(str) + " " +
    df["description"].astype(str) + " " +
    df["extended_description"].astype(str)
)

# TF-IDF vectorization
vectorizer = TfidfVectorizer(stop_words="english")

tfidf_matrix = vectorizer.fit_transform(df["combined_text"])

# Recommendation function
def recommend_startups(user_input, top_n=5):

    # Convert user query to vector
    user_vector = vectorizer.transform([user_input])

    # Compute similarity
    similarity_scores = cosine_similarity(
        user_vector,
        tfidf_matrix
    )

    scores = similarity_scores.flatten()

    # Get top matches
    top_indices = scores.argsort()[-top_n:][::-1]

    print("\nRecommended Similar Startups:\n")

    for idx in top_indices:

        print(f"Startup: {df.iloc[idx]['name']}")
        print(f"Industry: {df.iloc[idx]['industry']}")
        print(f"Description: {df.iloc[idx]['description']}")
        print(f"Similarity Score: {round(scores[idx], 3)}")
        print("-" * 60)

# User query
query = "AI healthcare platform for pets"

recommend_startups(query)