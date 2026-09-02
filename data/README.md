# Public-safe demo data

`books.csv` contains public titles and author names for 350 widely recognized
books. Its IDs, genre assignments, and three-sentence descriptions were created
for this project; the descriptions are original summaries rather than copied
publisher text. The catalog was curated with reference to major reading lists:

- https://www.nypl.org/books-more/recommendations/125/adults
- https://www.theguardian.com/world/2002/may/08/books.booksnews
- https://www.penguin.co.uk/discover/articles/100-must-read-classic-books

All material in `posts.csv` is synthetic. This directory must not contain real
user posts, real account IDs, behavioral histories, private data, or content
copied from social-media platforms.

`posts.csv` includes deliberately varied writing styles and a small off-topic
sample. The `is_book_related` field marks which rows belong in the recommender.

`labelled_posts_training.csv` is a balanced 540-row content-type training set:
180 reviews, 180 recommendations, and 180 discussions. It includes 101 difficult
review examples that an earlier model confused with recommendations, 15
corrected rhetorical-question reviews, and 15 replacement discussions with
genuine reader questions. Because the source posts did not contain explicit
recommendations, all 180 recommendations were generated with varied wording
and writing styles. The `origin` column records these sources.
`labelled_posts_training.xlsx` contains the same rows plus a readable summary
sheet for auditing the labels.
