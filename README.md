# Startup Sandbox (MVP)

Free-data business analysis web app.

## Sources used

- Wikipedia
- Wikidata
- Open CSV datasets (`data/companies.csv`, `data/funding_rounds.csv`)
- Yahoo Finance (for public companies with a ticker)

## Run

```powershell
npm.cmd start
```

Open `http://localhost:3000`.

## Notes

- Use `http://localhost:3000`, not `file:///.../index.html`.
- Add your own rows to `data/companies.csv` and `data/funding_rounds.csv` to improve startup coverage.
- Yahoo Finance enrichment is best for public companies.
