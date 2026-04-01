# HANDOFF

## Current Progress

- Baseline RAW marketing pipeline scaffold is built.
- Canonical brand/source files exist:
  - `brand-core.md`
  - `content-strategy.md`
  - `offers.json`
  - `proof-bank.json`
- Core system files exist:
  - `scripts/generate.js`
  - `scripts/render.js`
  - `scripts/queue.js`
  - `api/telegram.js`
  - `.github/workflows/raw-marketing-pipeline.yml`
- Five branded template families exist in `templates/`.
- Supplemental source pipeline is implemented:
  - class transcript intake
  - class audio intake via Telegram
  - article URL intake via Telegram
  - source document storage
  - supplemental angle bank
  - promotion of top supplemental drafts into the main review queue
- New persistent stores exist:
  - `pending/source-documents.json`
  - `pending/supplemental-bank.json`
  - `pending/queue.json`
  - `pending/review-memory.json`

## What Is Working

- Queue/state structure is in place.
- Supplemental posts now carry:
  - `content_origin`
  - `source_document_id`
  - `supplemental`
  - `freshness_window`
- Telegram commands implemented:
  - `/review`
  - `/status`
  - `/source-status`
  - `/regenerate`
  - `/sessions`
  - `/enrollment`
  - `/spotlight`
  - `/class`
  - `/article <url>`
- Local syntax checks passed on the touched JS modules.
- In-memory smoke tests passed for:
  - transcript -> angles -> promoted drafts
  - article -> angles -> promoted drafts

## What Is Not Live Yet

- `sessions.json` is still empty.
- `pending/queue.json` is still empty in repo state.
- No real env keys are configured in this workspace.
- Full live path has not been end-to-end tested with:
  - Telegram webhook
  - real Anthropic generation
  - real OpenAI transcription
  - live article fetches in production
  - Playwright rendering with installed dependencies
  - Buffer posting

## Main Blockers

- Need real secrets in `.env` or deployment env:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `RAW_TELEGRAM_BOT_TOKEN`
  - `RAW_TELEGRAM_CHAT_ID`
  - `BUFFER_ACCESS_TOKEN`
  - `BUFFER_PROFILE_IDS`
  - `GITHUB_TOKEN`
  - `GITHUB_REPO`
- Need verified session data added to `sessions.json`.
- Need `npm install` and Playwright browser install before rendering can be exercised.
- Need webhook deployment target and Telegram webhook registration.

## Recommended Next Steps

1. Install dependencies and Playwright.
2. Create a real `.env` from `.env.example`.
3. Add at least one verified upcoming session to `sessions.json`.
4. Run mock generation locally first to inspect queue behavior.
5. Run render locally and inspect PNG output.
6. Test Telegram text intake with `/class` and `/article`.
7. Test Telegram audio intake with a real voice note.
8. Verify approve/skip/reject review flow.
9. Test Buffer posting only after queue and media look correct.

## Resume Commands

```powershell
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
npm install
npx playwright install chromium
Copy-Item .env.example .env
node scripts/generate.js --mock --force
node scripts/render.js
```

## Useful Manual Test Ideas

```powershell
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
node --check scripts\lib\raw-core.js
node --check scripts\lib\generation.js
node --check scripts\lib\sources.js
node --check api\telegram.js
```

## Notes

- The supplemental source pipeline is intentionally conservative:
  - transcript/article inputs create a bank of angles first
  - only a top subset is promoted into the main queue
  - supplemental content does not automatically increase posting cadence
- Transcript-driven content is the strongest anti-slop lane because it starts from real RAW teaching language.
- Article-driven content is filtered to actor relevance and freshness; weak articles should be rejected rather than forced into content.
