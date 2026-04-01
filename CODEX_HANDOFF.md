# RAW Actor Studio — Marketing Pipeline Implementation

You are building an automated Instagram content pipeline for RAW Actor Studio, a Toronto-based acting school. Read `PLAN.md` in this same folder for full context (brand guidelines, content pillars, templates, session calendar schema).

## Summary

Generate branded social posts via Claude API → render 1080x1080 PNGs via Playwright → Telegram review bot → Buffer auto-schedules to Instagram.

**Key feature:** Session-aware generation — content automatically shifts to class enrollment pushes when a new session is approaching.

---

## What to build (in order)

### Task 1: Foundation Files

Create:
- `package.json` (name: "raw-marketing", type: "module", engines >=20, deps: @anthropic-ai/sdk ^0.39.0, playwright ^1.50.0)
- `brand-guidelines.md` (copy from PLAN.md "Brand Guidelines" section)
- `content-strategy.md` (copy from PLAN.md "Content Pillars" section, include hashtag banks + platform notes)
- `sessions.json` (initial entry for The Master Level 1, May 2026 — see PLAN.md for schema)
- `campaigns.json` (empty array `[]` for now)
- `.env.example` (ANTHROPIC_API_KEY, RAW_TELEGRAM_BOT_TOKEN, RAW_TELEGRAM_CHAT_ID, BUFFER_ACCESS_TOKEN, BUFFER_PROFILE_IDS, GITHUB_TOKEN, GITHUB_REPO)
- `approved-posts/.gitkeep`
- Empty `scripts/` and `templates/` dirs

Commit: `feat(raw): add foundation files and brand docs`

---

### Task 2: HTML Post Templates

Create 5 templates at `templates/`. Each is a self-contained HTML file rendered by Playwright at exactly 1080x1080px. Content injected by the render script via element `id` attributes.

**All templates share:**
- `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap');`
- `body { width: 1080px; height: 1080px; overflow: hidden; }`
- Wordmark: "RAW ACTOR STUDIO" (Inter 600, 18px, letter-spacing .14em, uppercase)

#### templates/craft-tip.html
- Dark bg `#0A0A0A`, off-white text `#F0F0F0`, accent `#C4A35A`
- Top row: wordmark left, amber pill right (category, e.g., "ON-CAMERA TECHNIQUE")
- Middle: amber label (`#label`), large headline Bebas Neue 72px (`#headline`), body Inter 300 28px rgba(240,240,240,0.55) (`#body`)
- Bottom: tagline "Training That Meets Industry Reality." DM Serif Display italic 22px, muted gold

#### templates/philosophy.html
- Dark bg `#0A0A0A`
- Wordmark top-left (absolute)
- Centered: large italic quote DM Serif Display 76px (`#quote`)
- Attribution: Inter 300 22px (`#attribution`, default "— Sophie Ann Rooney, RAW Actor Studio")
- 3px gold accent bar at bottom (`#C4A35A`)

#### templates/enrollment.html
- Dark bg `#1A1714`
- Top row: wordmark left, urgency badge right (`#urgency`, e.g., "ENROLLMENT OPEN" or "LAST 3 SPOTS")
- Middle: amber label "UPCOMING CLASS" (`#label`), class name Bebas Neue 64px (`#class-name`), details block Inter 400 24px (`#details` — dates, price, duration, location)
- Discount code badge: amber-bordered pill (`#discount`, default "RAW10 — 10% OFF")
- Bottom: "Book at rawactorstudio.com" Inter 500

#### templates/spotlight.html
- Dark bg `#0A0A0A`
- Wordmark top-left
- "STUDENT SPOTLIGHT" amber label
- Lighter card area (rgba(240,240,240,0.06), border-radius 20px, padding 48px)
- Inside card: student quote Inter 400 32px in quotes (`#quote`), student name + class Inter 300 20px (`#attribution`)

#### templates/behind-the-scenes.html
- Dark bg `#0A0A0A`
- Wordmark top-left
- "IN THE ROOM" amber label (`#label`)
- Large text Bebas Neue 60px (`#headline`)
- Subtext Inter 300 24px muted (`#body`)
- Gold accent bar at bottom

Commit: `feat(raw): add branded HTML post templates`

---

### Task 3: Content Generation Script

Create `scripts/generate.js`. This is an ESM Node.js script that:

1. Reads `brand-guidelines.md`, `content-strategy.md`, `sessions.json`
2. Checks if any session has `enrollment_open` within 14 days — if so, shifts content to enrollment focus
3. Generates 6 posts (2 weeks x Tue/Thu/Sat) via Claude Sonnet API
4. Each post has: `type` (craft-tip|philosophy|enrollment|spotlight|behind-the-scenes), `date`, `headline`, `label`, `image_body`, `caption`, `hashtags[]`, `status: "pending"`
5. Enrollment posts also include: `class_name`, `price`, `dates`, `discount_code`, `urgency_text`
6. Writes output to `pending/queue.json`

The Claude prompt should include:
- Full brand guidelines
- Content strategy
- Active session info (if enrollment is open)
- Post type description
- Previously generated posts (to avoid repeating hooks)

Post JSON schema:
```json
{
  "type": "craft-tip",
  "date": "2026-04-08",
  "headline": "Short punchy headline (max 10 words)",
  "label": "Category label (2-3 words)",
  "image_body": "1-2 sentence body (max 40 words)",
  "caption": "Full Instagram caption (150-220 words)",
  "hashtags": ["RAWActorStudio", "ActingToronto", "..."],
  "status": "pending"
}
```

For enrollment posts, add:
```json
{
  "class_name": "The Master (Level 1)",
  "price": "$550 CAD",
  "dates": "May 5 - June 13",
  "discount_code": "RAW10",
  "urgency_text": "ENROLLMENT OPEN"
}
```

Commit: `feat(raw): add session-aware content generation script`

---

### Task 4: Image Rendering Script

Create `scripts/render.js`. Same pattern as generate — ESM Node.js:

1. Reads `pending/queue.json`
2. For each post, loads the matching template (`templates/{type}.html`)
3. Injects content by replacing placeholder text and via `<script>` tag that sets element `textContent` by id
4. Playwright screenshots at 1080x1080
5. Saves to `approved-posts/{date}-{type}.png`
6. Updates post objects with `image_path`
7. Writes updated queue back

```bash
cd "RAW Marketing Pipeline" && npx playwright install chromium
```

Commit: `feat(raw): add Playwright image rendering script`

---

### Task 5: Queue State Helper

Create `scripts/queue.js` — GitHub Contents API helpers:

```javascript
// getQueue(token, repo, path) → {posts: [], sha}
// saveQueue(token, repo, path, queue) → void
// getCurrentPost(token, repo, path) → post|null
```

Same pattern as First Take. Parameterized by `GITHUB_TOKEN`, `GITHUB_REPO`. Queue path: `pending/queue.json`.

Commit: `feat(raw): add GitHub API queue state helper`

---

### Task 6: Telegram Webhook

Create `api/telegram.js` — Vercel serverless function.

Env vars: `RAW_TELEGRAM_BOT_TOKEN`, `RAW_TELEGRAM_CHAT_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`, `BUFFER_ACCESS_TOKEN`, `BUFFER_PROFILE_IDS`, `ANTHROPIC_API_KEY`

Commands to handle:
- `/review` → show next pending post with image + caption + approve/skip buttons
- `/status` → queue counts
- `/regenerate` → trigger GitHub Actions workflow_dispatch
- `/sessions` → read sessions.json, list upcoming with enrollment status
- `/enrollment` → force-generate an enrollment post for nearest session (calls Claude inline, renders text-only preview)
- `/spotlight <name>` → bot replies asking for quote, then generates spotlight post
- Free text → revise current pending post via Claude
- Callback queries → approve (Buffer API) / skip

Buffer posting: same as First Take — `https://api.bufferapp.com/1/updates/create.json` with form-encoded params.

Commit: `feat(raw): add Telegram webhook handler`

---

### Task 7: GitHub Actions Workflow

Create `.github/workflows/raw-marketing-pipeline.yml`:

```yaml
name: RAW Marketing Pipeline
on:
  schedule:
    - cron: '0 9 8,22 * *'
  workflow_dispatch:
jobs:
  generate-and-render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: node scripts/generate.js
        env: { ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}' }
      - run: node scripts/render.js
      - run: |
          git config user.name "RAW Marketing Bot"
          git config user.email "bot@rawactorstudio.com"
          git add pending/queue.json approved-posts/
          git diff --staged --quiet || git commit -m "chore(raw): generate content batch $(date +%Y-%m-%d)"
          git push
      - name: Send preview to Telegram
        env:
          RAW_TELEGRAM_BOT_TOKEN: '${{ secrets.RAW_TELEGRAM_BOT_TOKEN }}'
          RAW_TELEGRAM_CHAT_ID: '${{ secrets.RAW_TELEGRAM_CHAT_ID }}'
          GITHUB_REPO: '${{ github.repository }}'
        run: |
          node --input-type=module << 'EOF'
          import fs from 'fs';
          const queue = JSON.parse(fs.readFileSync('pending/queue.json', 'utf-8'));
          const first = queue.posts.find(p => p.status === 'pending');
          if (!first) process.exit(0);
          const img = `https://raw.githubusercontent.com/${process.env.GITHUB_REPO}/main/${first.image_path}`;
          const caption = `*New RAW content batch!*\n\n*Post 1* - ${first.date} (${first.type})\n*Headline:* ${first.headline}\n\nSend /review to start.`;
          await fetch(`https://api.telegram.org/bot${process.env.RAW_TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: process.env.RAW_TELEGRAM_CHAT_ID, photo: img, caption: caption.slice(0,1024), parse_mode: 'Markdown' })
          });
          EOF
```

Secrets to add in GitHub: `ANTHROPIC_API_KEY`, `RAW_TELEGRAM_BOT_TOKEN`, `RAW_TELEGRAM_CHAT_ID`

Commit: `feat(raw): add GitHub Actions cron pipeline`

---

### Task 8: End-to-End Test

1. Run `npm install` in project root
2. Create Telegram bot via @BotFather, save token
3. Set env vars locally
4. Run `node scripts/generate.js` — verify 6 posts in `pending/queue.json`
5. Run `node scripts/render.js` — verify 6 PNGs in `approved-posts/`
6. Open PNGs — verify dark brand, correct fonts/colors per template type
7. Deploy webhook to Vercel, register with Telegram
8. Send `/status` to bot — verify response
9. Send `/review` — verify image + caption preview
10. Approve a post — verify Buffer queue populated
11. Trigger GitHub Actions manually — verify full pipeline

---

## Project Notes

- All scripts are ESM (`"type": "module"`) — use `import`, not `require`
- Node.js 20+ required
- Vercel serverless functions use `export default async function handler(req, res)`
- Buffer API uses native `fetch` (no SDK needed)
- Images served via GitHub raw CDN: `https://raw.githubusercontent.com/{repo}/main/{path}`
