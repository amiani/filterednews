# filterednews

Shows the stories on the current Hacker News front page that are AI news. Each
story is scored by TypeSafe's Jev decision model (`~typesafe/jev-latest`) via
OpenRouter's Decisions API. Show HN posts are skipped. Scores are stored in
Postgres, so each story is only scored once per prompt/model version.

## Run

```sh
pnpm install
cp .env.example .env   # set OPENROUTER_API_KEY and DATABASE_URL
pnpm start             # http://127.0.0.1:3000
```

Migrations run on startup. Routes:

- `/`: AI news on the front page
- `/api/digest`: the latest scored front page as JSON
- `/health`

`pnpm spike` scores the current front page without a database and prints every
probability. Use it to tune the decision in `src/AiNewsFilter.ts`. Bump
`PROMPT_VERSION` after you change the decision so stories are scored again.

## Configuration

| Variable             | Default                |                                                     |
| -------------------- | ---------------------- | --------------------------------------------------- |
| `OPENROUTER_API_KEY` | required               |                                                     |
| `DATABASE_URL`       | required               | Postgres URL                                        |
| `DECISION_MODEL`     | `~typesafe/jev-latest` |                                                     |
| `AI_THRESHOLD`       | `0.5`                  | Minimum AI news probability to show a story         |
| `REFRESH_INTERVAL`   | `10 minutes`           |                                                     |
| `SCORE_CONCURRENCY`  | `4`                    |                                                     |
| `HOST` / `PORT`      | `127.0.0.1` / `3000`   | Put a reverse proxy in front, or set `HOST=0.0.0.0` |

## Development

```sh
pnpm check         # tsc
pnpm lint          # oxlint (type-aware, with Effect rules)
pnpm format        # oxfmt
pnpm test          # vitest; StoryStore tests use TEST_DATABASE_URL
                   # (default postgres://localhost:5432/filterednews_test)
```
