# Book Recommendation System

An English-language, content-based recommendation demo for book discussion posts.
It builds a reader-interest vector from selected books, retrieves similar posts
with Qdrant, ranks them by relevance and engagement, and learns from feedback.

## Public-data policy

This repository contains no real user data. The catalog uses public book titles
and author names, while its descriptions, posts, user IDs, engagement counts,
and interactions are original synthetic demo data. Do not add scraped
social-media content, real account identifiers, private interactions, or copied
publisher descriptions.

## Data required

The project uses these CSV files in `data/`:

- `books.csv`: public bibliographic metadata with original demo descriptions;
  `book_id,title,author,genre,description`
- `posts.csv`: fully synthetic discussion posts;
  `post_id,user_id,book_id,content,published_at,view_count,like_count,comment_count,repost_count,is_book_related,writing_style,content_length`
- `labelled_posts_training.csv`: balanced synthetic classifier data containing
  180 reviews, 180 recommendations, and 180 discussions
- `user_events.csv`: `user_id,book_id,event,timestamp`, where event is `read`,
  `saved`, or `searched`.

Run the processing step to create the generated local files:

```bash
python -m pip install -r requirements.txt
python cleaning.py --skip-qdrant
```

## Evaluate post relevance

```bash
python relevance.py
```

`relevance.py` independently compares every post with its assigned book's
description. It writes `data/posts_with_relevance.csv` with a semantic
`relevance_score` and `predicted_is_book_related` value. The original
`is_book_related` label is retained only so the synthetic predictions can be
evaluated; it is not an input to the predictor. This is currently an auditing
step and does not replace the original label used by `cleaning.py`.

This writes `data/posts_processed.csv` and `data/post_embeddings.npy`.
Rows with `is_book_related=0` remain in the raw synthetic dataset as realistic
noise but are excluded before embeddings and recommendation indexing.

## Train the content classifier

```bash
python train_content_classifier.py
```

Training keeps every `book_id` in only one of the train, validation, or test
splits. It freezes the sentence-transformer embeddings and learns a small
three-class linear softmax head over 384 semantic values plus eight transparent
text-intent features. Recommendations must contain explicit advice to read,
try, or avoid the book. The command saves portable weights to
`models/content_classifier.npz`, evaluation details to
`models/content_classifier_metrics.json`, and auditable held-out predictions
to `models/content_classifier_test_predictions.csv`. `cleaning.py` loads this
artifact and writes its review, recommendation, or discussion prediction plus
confidence and probability margin into `data/posts_processed.csv`.

The current held-out score is based entirely on synthetic, rule-informed data.
It verifies this demo pipeline, but it is not evidence of real-world accuracy;
real deployment would require independently labelled human-written posts.

## Run the app

```bash
python -m streamlit run app.py
```

Without Qdrant credentials, the app builds a local in-memory index from the
processed synthetic data. With a Qdrant cloud collection, set `QDRANT_URL` and
`QDRANT_API_KEY` before running `cleaning.py` without `--skip-qdrant`.

## How ranking works

- 60% semantic similarity to the reader profile
- 12% exact title, author, or genre matches
- 10% freshness
- 8% like rate
- 4% post length
- 3% comment rate
- 3% normalized views

If direct matches are insufficient, the system expands through related genres
from the genre taxonomy and finally searches general book content.

## Tests

```bash
python -m unittest discover -s tests -v
```
