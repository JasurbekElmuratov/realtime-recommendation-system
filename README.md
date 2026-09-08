# BookFeed

BookFeed recommends book-discussion posts using their meaning, a reader's activity,
and a small set of ranking rules. The main product is a Next.js website backed by
an existing FastAPI API. It uses real Python recommendation code and a synthetic
CSV dataset: 350 books and 4,000 posts, of which 3,680 are book-related.

For the complete file map, data flow, ranking math, API reference, and limitations,
read [Architecture](docs/ARCHITECTURE.md). For a guided reading order and interview
explanations, read [Interview guide](docs/INTERVIEW_GUIDE.md).

```text
CSV catalog → cleaning + MiniLM embeddings → Qdrant Cloud or local .npy cache
                                                  ↓
Browser → FastAPI → build user interests → retrieve → rank → diversify → feed
   ↓
User actions → POST /events → interactions.csv → interests for the next batch
```

## Install

Use Python 3.11+ and Node.js 20.9+.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cd frontend
npm install
cd ..
```

Copy the example files if your local files do not already exist. Keep real keys
out of Git. `.env.example` leaves Qdrant empty so local development works without
Cloud credentials.

```bash
cp -n .env.example .env
cp -n frontend/.env.example frontend/.env.local
```

Prepare the local index. The first run may download the pretrained MiniLM model;
later runs can use its cached files. The committed content classifier is already
trained.

```bash
python cleaning.py --skip-qdrant
```

This writes `data/posts_processed.csv` and `data/post_embeddings.npy`. Run it again
when the catalog posts or embedding/classification model change. Restart the API
after rebuilding because it caches the index in memory.

## Run the website

Terminal 1, from this project directory:

```bash
source .venv/bin/activate
uvicorn api.main:app --reload --env-file .env --port 8000
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Open [BookFeed](http://localhost:3000). The API has interactive
[Swagger documentation](http://localhost:8000/docs), an
[OpenAPI schema](http://localhost:8000/openapi.json), and a
[health endpoint](http://localhost:8000/health).

The frontend's `.env.local` uses:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_USER_ID=1
```

Run one API process. The CSV writers use a simple thread lock, which handles
simultaneous requests within that process. This local demo does not support
multiple API workers sharing the same CSV files.

## Backend API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Catalog counts and configured retrieval mode |
| GET | `/health/qdrant` | Check the Cloud collection connection |
| GET | `/feed/{user_id}` | Ranked batch; accepts `limit`, `cursor`, `session_id` |
| POST | `/events` | Save an interaction and update the profile version |
| GET | `/users/{user_id}` | Profile, liked/saved posts, and activity |
| POST | `/posts` | Create a post for an existing book |
| GET | `/posts/{post_id}` | Post and attached book for the reading page |
| GET | `/search` | Relevant posts and matching books |
| GET | `/books` | Catalog lookup; accepts `q` and `limit` |
| GET | `/recommendations/{user_id}/debug` | Latest pipeline details |

The website supports infinite scrolling, search, likes, saves, hiding a post,
author follows, post creation, refreshable reading pages, and a recommendation
inspector. Actions affect the next batch; visible posts keep their order. Likes
and saves survive a refresh because the API rebuilds them from the event CSV.

This is a demo account, without authentication. Comments record an interaction;
comment text is not stored. Newly created posts appear in the profile and direct
post page immediately; rerun cleaning and restart the API to include qualifying
new posts in the vector index. These are existing product limits, explained in
the architecture guide.

## Optional Qdrant Cloud

Set `QDRANT_URL` and `QDRANT_API_KEY` in your private `.env`. The API loads that file
only when started with `--env-file .env`. Python scripts read environment variables,
so export them before running the scripts:

```bash
set -a
source .env
set +a
python scripts/check_qdrant.py
```

To rebuild and upload the index:

```bash
python cleaning.py
```

This command **replaces the `posts` collection** with the processed dataset. The
`--skip-qdrant` version only writes the local index. The API prefers Cloud when
credentials are present and falls back to local retrieval when a Cloud query fails.
The feed/debug response reports the mode used for that request. Cloud and cached
retrieval share scoring rules but have different candidate-search strategies.

If neither index exists, the API has a basic CSV ranking fallback; semantic
embeddings are not used for candidate scores in that mode. Preparing the local
index is the normal development setup.

## Optional tools

- `python scripts/fetch_book_covers.py --limit 5`: find covers on Open Library and
  cache them in `frontend/public/book-covers/`. Omit the limit for the full catalog.
  Missing covers use the committed placeholder; the browser does not contact Open Library.
- `streamlit run app.py`: run the older Python interface with Qdrant credentials
  exported. It uses separate activity files and is not the website's backend.
- `python train_content_classifier.py`: retrain the content-type classifier from
  `data/labelled_posts_training.csv`; writes weights, metrics, and test predictions.

`generate_recommendations.py` also has a legacy command-line example that expects
`data/user_events.csv`, which is not included. Its reusable ranking functions are
used by both interfaces; running its command-line example is not a setup step.

## Verification

```bash
python -m unittest discover -s tests -v
python scripts/evaluate_personalization.py --interest dostoevsky
cd frontend
npm run lint
npm run build
```

The evaluation uses a temporary event log. It checks whether a search, click,
like, save, and normalized read move relevant books upward. Add `--require-qdrant`
to require Cloud retrieval. Most API unit tests use the CSV fallback to keep them
fast; the evaluation exercises actual embeddings when the prepared cache exists.

For the checks performed during the readability rewrite, see
[Verification](docs/VERIFICATION.md). If this environment blocks Turbopack's CSS
worker port, use `npm run build -- --webpack` and `npm run dev -- --webpack`.
Both Webpack commands were verified here.

## Data and model claims

All posts, nicknames, identifiers, engagement numbers, and training examples are
synthetic. Public book titles and author names have original project descriptions.
The main runtime event log is local and ignored by Git. A fresh clone creates an
empty log; an existing checkout keeps its previous activity.

MiniLM is pretrained; this project does not train it from scratch. The trained
logistic-regression classifier predicts **review, discussion, or recommendation**.
The recommendation ranker uses hand-chosen weights: similarity 60%, exact terms
12%, freshness 10%, like rate 8%, post length 4%, comment rate 3%, views 3%, followed
by catalog bonuses and diversity rules. Recorded classifier metrics on synthetic
data are not a measurement of recommendation quality on real users.
