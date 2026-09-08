# Verification of the readability rewrite

The preserved pre-edit source is in `/private/tmp/bookfeed-before-simplification`.
Existing uncommitted changes were the comparison baseline.

## Passed checks

- Python: 44 tests passed in the full suite. After adding the retrieval-mode
  regression, all 21 API tests passed; together with the 24 core tests this covers
  45 tests in the final source.
- Frontend: `npm run lint` and `npx tsc --noEmit` passed.
- Production build: `npm run build -- --webpack` passed and generated all pages,
  including the dynamic post route.
- Real MiniLM/cached-index comparison: ten original/simplified feed, search, and
  user-state snapshots matched exactly after excluding random request IDs,
  generated timestamps, and latency. Rankings, scores, metadata, cursors, and
  profile state were retained in the comparison.
- Core comparison: all 3,680 cleaned rows and classifier outputs matched, along
  with all 40 genre entries, 540 training split assignments, profile construction,
  feedback branches, popularity outputs, and sampled ranking results.
- Frontend comparison: API mappings matched the original for all ten snapshots.
  Event order, failed-event persistence/retry, synchronization status, and
  impression deduplication passed the isolated event-service check.
- Controlled personalization: matching Dostoevsky posts increased from zero to
  three in the top 20, with the best at rank 1. The event log was temporary.

## Browser walkthrough

The actual Next.js app and FastAPI server ran against temporary copies of the
post/user files and a temporary event log, with the real cached embedding index.
The walkthrough verified:

1. Home loaded ten real catalog posts.
2. Like and save states appeared on the reading page.
3. Saved and liked states survived a page reload.
4. Opening/reading a post recorded synced click and normalized dwell events.
5. Searching Dostoevsky returned relevant posts and matching books.
6. A newly published test post appeared on the profile.
7. Scrolling appended a second batch: ten displayed posts became twenty.
8. The inspector displayed the updated interest profile, cached retrieval mode,
   candidates, scores, and selected posts.

The browser reported no JavaScript console errors. The real catalog and user
interaction log were not changed by these checks. Temporary test servers were
stopped afterward.

## Verification limits

Qdrant Cloud connectivity/upload was not exercised. The classifier was not
retrained and the real processed dataset was not regenerated. Existing artifacts
were compared and the preparation command was covered with temporary/mock inputs.

Default Turbopack compilation was blocked by its CSS worker's local port binding
in this environment, including after the command was approved. The supported
Webpack build and Webpack development server both succeeded. Use
`npm run build -- --webpack` or `npm run dev -- --webpack` if that local restriction
occurs here.
