# BookFeed frontend

This is the Next.js and React website for BookFeed. It calls the existing FastAPI
backend; recommendation calculations run in Python. Read the complete
[architecture](../docs/ARCHITECTURE.md) and [interview guide](../docs/INTERVIEW_GUIDE.md)
for the backend, data preparation, ranking formula, and project limitations.

## Run

Start the backend from the project root after following the root README setup:

```bash
source .venv/bin/activate
uvicorn api.main:app --reload --env-file .env --port 8000
```

In a second terminal, from this frontend directory:

```bash
cp -n .env.example .env.local
npm install
npm run dev
```

Open [BookFeed](http://localhost:3000). The backend's interactive API documentation
is at [Swagger UI](http://localhost:8000/docs).

`.env.local` contains the backend address and demo user:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_USER_ID=1
```

This demo has no login system. The configured user ID selects a record from the
backend's user CSV.

## Read the code in this order

1. `src/app/layout.tsx` wraps every page in the shared provider and navigation.
2. `src/app/home/page.tsx` shows the Home screen and refresh controls.
3. `src/components/feed.tsx` displays posts, records visible impressions, and loads
   the next page when the reader scrolls toward the bottom.
4. `src/providers/bookfeed-provider.tsx` stores shared page state and defines named
   actions such as `likePost`, `savePost`, `refreshFeed`, and `createPost`.
5. `src/services/feed.ts` requests feed/search/book/post data. `users.ts` requests
   the profile. `api.ts` provides the common HTTP request function.
6. `src/services/contracts.ts` describes the JSON fields returned by FastAPI.
   Service functions rename Python's `snake_case` fields to React's `camelCase`.
   `src/types/index.ts` describes the data used by the UI.
7. `src/services/events.ts` sends interactions to `POST /events`, in action order.
   Failed events are saved in local storage and retried when the app reloads.
8. `src/components/post-detail.tsx` records a post opening and visible reading time.

The provider keeps one copy of the user and one feed response. Liked IDs, saved
IDs, followed authors, and displayed lists are calculated from that state.
React context makes the state and actions available through `useBookFeed()`.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Redirects to Home |
| `/home` | Ranked feed, infinite scrolling, button and pull-to-refresh |
| `/explore` | Search posts and books, expand book details, follow authors |
| `/saved` | Saved posts |
| `/profile` | Own posts, saved posts, and liked posts |
| `/create` | Publish a short post linked to a catalog book |
| `/onboarding` | Send selected interests as search signals |
| `/post/[postId]` | Read one post, like/save it, record reading time |
| `/debug` | Inspect recommendation scores, candidates, latency, and events |

`AppShell` supplies desktop/mobile navigation and the contextual right sidebar.
`PostCard` supplies likes, saves, comments, sharing, book details, hiding a post,
and the score inspector. Smaller components render covers, headers, empty/loading
states, interests, and activity. Tailwind classes and `globals.css` supply styles.
The icons and local book-cover files are static assets.

## An action from click to recommendation

```text
Like button → provider updates visible state → event service → POST /events
                                                      ↓
                                              interactions.csv
                                                      ↓
Next batch or refresh → GET /feed/{user_id} → updated recommendations
```

The first Home request asks for 10 posts. The backend returns an opaque cursor,
which the frontend passes back unchanged for the next batch. New batches are
appended without duplicate post IDs. Interactions do not reorder posts already
on screen. Saved and liked lists are restored from the backend after a reload.

A post impression requires at least 50% visibility for 550 ms and is sent only
once per post/feed request/browser session. Reading time excludes hidden tabs and
is sent when leaving a post after at least two seconds. Its expected duration is
based on 225 words per minute, with a four-second minimum.

## Existing demo limits

- Comments record an interaction; comment text is not saved or displayed later.
- Onboarding choices become search events, rather than a separate preferences API.
- The “Trending books” panel shows the first four catalog books; it is not a
  weekly trend calculation.
- Failed interaction requests retry on app reload. There is no background sync
  worker.
- The website uses the project's synthetic book/post CSV dataset through the API.

## Check changes

```bash
npm run lint
npm run build
```

The verified production build used `npm run build -- --webpack`. If this local
environment blocks Turbopack's CSS worker port, use that command and
`npm run dev -- --webpack`. See [verification details](../docs/VERIFICATION.md).

Some React tools remain because they implement visible behavior: state updates
render the UI, effects load data and observe scrolling, refs remember timers or
pending requests, and a small promise queue preserves interaction order. The code
uses explicit steps and named functions rather than extra state-management or
HTTP libraries.
