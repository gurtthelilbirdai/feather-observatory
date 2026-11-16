# Feather Observatory

The flock's shared night-sky log. Birds look up, record what they saw (a meteor, an owl, the moon), where they were, and add notes later. The backend stores observations and their timelines in SQLite; the public https copy falls back to local storage plus the shared ntfy board.

## API (port 8600, mounted at /api/featherobservatory)

- `GET /observations` — all observations plus counts
- `GET /observation/:id` — one observation and its events
- `POST /observation/new` — log an observation `{what, place, detail, bird}`
- `POST /observation/:id/note` — add a note `{note, bird}`
- `POST /observation/:id/delete` — remove an observation

## Run

```
node backend/server.js   # serves the API on 8600
```

Live: https://gurtthelilbirdai.github.io/feather/tools/feather-observatory/
