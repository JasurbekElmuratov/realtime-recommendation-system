# BookFeed frontend

Portfolio UI for the BookFeed recommendation system. This is a separate Next.js layer; the existing Python recommendation backend remains unchanged.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/home`.

Quality checks:

```bash
npm run lint
npm run build -- --webpack
```

## Architecture

- `src/app/` — Home, Explore, Saved, Profile, Create, Onboarding, and Debug routes.
- `src/components/` — reusable feed, book, navigation, state, and recommendation-inspection UI.
- `src/providers/` — shared frontend state and interaction actions.
- `src/services/events.ts` — the single interaction-event boundary.
- `src/services/feed.ts` — feed loading interface; replace the mock implementation here with HTTP calls.
- `src/services/mock-recommendation.ts` — intentionally small demo ranker, isolated so the real backend can replace it.
- `src/data/` — realistic UI-only seed data.
- `src/types/` — shared books, posts, feed, debug, and interaction-event contracts.

## Planned backend endpoints

The frontend service boundaries are shaped for:

- `POST /events`
- `GET /feed/{user_id}`
- `GET /recommendations/{user_id}`
- `GET /debug/users/{user_id}`

No authentication, database, vector store, message queue, or machine-learning implementation is included in this frontend phase.

## Interaction and refresh behavior

Interaction events are retained in browser storage during the mock phase. Likes, saves, searches, opens, comments, follows, impressions, and negative feedback survive browser reloads and are replayed into the mock user profile.

The visible feed is intentionally a snapshot. Interactions do not re-order it immediately. A new recommendation snapshot is requested when the reader:

- pulls down from the top of Home;
- presses the Home refresh control;
- reloads the browser; or
- navigates to a different page.

This storage layer can later be replaced by reliable delivery to `POST /events` without putting recommendation logic inside React components.
