# Understand and explain BookFeed

## A short explanation

“BookFeed recommends book-discussion posts. I use a pretrained MiniLM model to
represent each post as a vector. The backend combines a reader's searches, likes,
saves, and reading activity into an interest vector, retrieves similar posts, and
ranks them with relevance, freshness, and engagement rules. A FastAPI API serves a
Next.js interface. Activity is saved in CSV and affects the next feed batch.”

Use first-person claims only for decisions and implementation you can explain.
The code includes generated assistance and pretrained components; understanding
the choices is more useful than presenting every line as written from scratch.

## Read the code in this order

1. **`api/main.py`** — Find `/feed/{user_id}` and follow the call to `feed.get_feed`.
   Each route accepts input, calls a service, and returns JSON.
2. **`api/services/feed_service.py`** — See how the cursor prevents repeats and how
   posts, books, scores, and ranks become the response.
3. **`api/services/recommendation_service.py`** — Begin at `recommend()`. Its four
   stages build interests, retrieve candidates, rank/diversify, and return debug
   details. Then read `_profile()` and `_weighted_vector()`.
4. **`generate_recommendations.py`** — Read `rank_results()`, `build_feed()`, and
   `recommend_for_profile()`. Distinguish a score from the rules that order posts.
5. **`api/services/event_service.py`** — Follow one like into the CSV and then through
   `interaction_state()`. See why an unlike removes a like when events are replayed.
6. **`api/services/data_service.py`** — Understand the catalog lookup and how a new
   post is saved to disk and added to memory.
7. **`frontend/src/services/`**, then **`bookfeed-provider.tsx`** — Follow a browser
   action into an API request and a state update. The provider shares data across pages.
8. **`cleaning.py`**, then **`content_classifier.py`** — Learn how the index was built.
9. **`train_content_classifier.py`** — Read this when discussing classifier training
   and evaluation. Streamlit's `app.py` / `personalization.py` can come last.

## Ideas behind the code

**Embedding:** a list of numbers representing text meaning. MiniLM outputs 384
numbers. Nearby directions tend to represent related meanings.

**Normalization:** divide a vector by its length. For two unit vectors, their dot
product is cosine similarity. That is why the local search can use
`post_embeddings @ user_vector`.

**Weighted interests:** a save matters more than a casual click. Multiply each
activity vector by a weight, add them, and normalize. A negative action subtracts
its direction. Mix current-session activity with older interests.

**Retrieval versus ranking:** retrieval finds a manageable candidate pool. Ranking
uses more rules to choose and order the final posts. Diversity prevents the same
book or author from filling the batch.

**Classifier versus recommender:** the trained classifier predicts the kind of
post. The recommender decides whether it is relevant to this reader. These are
different tasks with different evaluation needs.

**Event log:** keep actions as rows instead of overwriting history. Replaying
`like → unlike → like` yields a liked post. Replaying `save → unsave` yields an
unsaved post. Impressions record exposure but have zero profile weight.

**Context/provider:** React's shared state container for this app. A page can ask
for the current feed or call `likePost` without passing those through every
intermediate component.

**Thread lock:** let one request at a time update a CSV. The supported setup is
one API process. This is the only concurrency mechanism needed for this local demo.

## Questions to practice

| Interview question | Accurate answer |
| --- | --- |
| Is there a backend API? | Yes. FastAPI serves feeds, posts, search, user state, events, catalog, and debug routes. |
| Did you train the embedding model? | No. MiniLM is pretrained. I use its vectors and train a separate linear content classifier. |
| Is this collaborative filtering? | No. It is content-based retrieval with weighted user activity and hand-written ranking rules. |
| What happens after a like? | The browser sends an event, the API saves it, and the next feed request rebuilds the interest vector. |
| What makes it real-time? | The next batch uses recent actions without an offline retraining job. Visible posts do not reshuffle. |
| Why retain some old interests? | One session should influence the feed without completely replacing longer-term preferences. |
| What happens for a new user? | Start with the general-books vector and update it as the user acts. |
| Why Qdrant? | It stores post vectors plus payloads and supports nearest-vector retrieval. A local NumPy cache is enough for this small demo. |
| Why use CSV? | It is simple to inspect and explain at this scale. A multi-user deployment would need a transactional store. |
| Is the ranker learned? | The main website ranker uses fixed weights and selection rules. The event log could support later ranking experiments. |
| How did you avoid train/test overlap? | Split classifier examples by book so examples about one book stay in one partition. |
| Does 100% classifier accuracy prove the recommender is good? | No. It is a saved result on small synthetic classification data, not evidence of real-user recommendation quality. |
| Does a newly published post appear in semantic search immediately? | No. Profile/detail update immediately; the vector index needs rebuilding. |
| What is the older Streamlit app? | A separate interface that shares retrieval/ranking functions, with its own profile and feedback flow. |

## Trace one example

A reader searches for “Dostoevsky,” opens a result, reads it, likes it, and saves it.

1. Search records text interest; the other actions identify the relevant post/book.
2. The backend encodes their text and builds a weighted session direction.
3. Because the session contains a search, it receives 65% of the blended profile.
4. Retrieval finds semantically related posts.
5. Exact author/title/category matches add small capped bonuses.
6. Diversity limits repeated books/authors; previously shown IDs are excluded.
7. The next feed batch reflects the updated interest.

The controlled cached-index check performed during this rewrite moved matching
Dostoevsky books from zero to three posts in the top 20, with the best at rank 1.
That is a concrete behavior check, not a general recommendation-quality benchmark.

## Small exercises before an interview

- Change the default batch size and find the frontend and backend limits involved.
- Explain each term in the base ranking score; predict what increasing freshness
  would favor before changing it.
- Add a like through `/docs`, request a feed, and inspect the debug profile.
- Explain why saved posts survive restarting the API while its debug snapshot does not.
- Trace how `book_id` joins a post to its title and cover.
- Run a test, read its assertion, and explain which user behavior it protects.

The rewrite uses explicit loops, named intermediate values, normal functions, and
small classes. Some array math, React hooks, and validation remain because they
perform real work. Readability can mean more lines: the aim is to make each step
explainable while preserving the existing product.
