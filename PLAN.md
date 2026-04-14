# RAW Actor Studio — Marketing Pipeline Plan

## What This Is

An automated Instagram content pipeline for RAW Actor Studio (Toronto). Generates branded social posts via Claude API, renders 1080x1080 PNGs via Playwright, routes through a Telegram review bot, and auto-schedules via Buffer.

**Key differentiator:** Session-aware generation — content automatically shifts to enrollment pushes when a new class session is approaching.

---

## Business Context

- **Business:** RAW Actor Studio, Toronto. Acting school focused on on-camera training for film/TV.
- **Founded:** Sophie Ann Rooney (director) + Grisha Pasternak
- **Location:** 21 College St, Toronto
- **Instagram:** @rawactorstudioto (~2.7K followers)
- **Classes:** The Master Level 1 ($550 CAD/6wk), On-Camera Audition ($550/6wk), REPS
- **Discount code:** RAW10 (10% off)
- **Email:** Mailchimp (not in scope for V1)
- **Website:** rawactorstudio.com (Wix)

---

## Brand Guidelines

### Voice & Tone
- **Direct and serious.** No fluff, no hedging.
- **Craft-focused.** Speak in technique: objectives, given circumstances, choices, specificity.
- **Industry-grounded.** "Training That Meets Industry Reality." On-set expectations, audition standards.
- **Respectful of all levels.** "All Levels, Genuinely Welcome" — never condescending to beginners, never dumbing down for anyone.
- **NOT casual, NOT salesy, NOT hobbyist.** This is professional training, treated as such.

### Key Phrases
- "A Clear, Repeatable System"
- "Training That Meets Industry Reality"
- "Individualized Coaching, Not One-Size-Fits-All"
- "Challenged without being broken down, supported without being coddled"
- "Acting is a job, not just an art"

### Never
- Generic acting motivation ("follow your dreams!", "believe in yourself!")
- Hobbyist framing ("fun way to explore acting!")
- Vague outcomes ("gain confidence")
- Competitor mentions
- Emoji spam
- More than one exclamation point per post

### Visual Brand
- **Background:** Near-black #0A0A0A or warm charcoal #1A1714
- **Text:** Off-white #F0F0F0
- **Accent:** Muted gold #C4A35A
- **Fonts:** Bebas Neue or Oswald (headlines), Inter (body)
- **Aesthetic:** Dark, cinematic, moody. Professional film school, not community theatre.
- **Image format:** 1080x1080px square PNG

### Pricing (always accurate)
- The Master Level 1: $550 CAD / 6 weeks (or 2x $275 installments)
- On-Camera Audition Level 1: $550 CAD / 6 weeks
- REPS: $550 CAD / 6 weeks
- Audition Coaching: $75/hour
- Discount: RAW10 for 10% off
- Free audits available

---

## Content Pillars (3 posts/week)

| Day | Pillar | Description |
|-----|--------|-------------|
| Tuesday | Craft Education | Acting technique, on-camera tips, audition room realities. Specific, actionable. Lineage-grounded (Stanislavski/Strasberg when relevant). Topics: cold reads, on-camera vs theatre, taking direction, specificity in choices, objectives, obstacles, moment before. |
| Thursday | Brand Identity / Philosophy | Sophie's coaching philosophy, the RAW system, what makes RAW different. "Training That Meets Industry Reality." Individualized coaching stories, the lineage, why a system matters. |
| Saturday | Enrollment / Student Spotlight (alternating) | **Even weeks:** class enrollment pushes (new session, early bird, last spots, RAW10). **Odd weeks:** student testimonials, behind-the-scenes class moments, growth stories. |

### Session-Aware Overrides
When a new session's enrollment opens (<14 days away):
- All 3 weekly posts shift to enrollment focus
- Early bird deadline triggers urgency content
- Last-spots triggers scarcity content
- After enrollment closes, reverts to normal rotation

### Hashtag Banks

**Always include (brand):**
#RAWActorStudio #ActingToronto #OnCameraActing

**Craft posts:**
#ActingTips #AuditionPrep #SceneStudy #FilmActing #TVActing #ActingTechnique #Stanislavski #ActingClass

**Enrollment posts:**
#TorontoActors #ActingSchool #ActingClassToronto #LearnActing #FilmSchoolToronto

**Spotlight posts:**
#ActorTraining #StudentSpotlight #ActorGrowth #WorkingActor

### Platform Notes (Instagram only)
- Caption: 150-220 words. Line breaks between paragraphs.
- 8-12 hashtags in first comment (not caption)
- Strong visual hierarchy in image
- Reels content is separate (not in this pipeline — manual for now)

---

## Templates (5)

### 1. craft-tip.html
- Dark bg (#0A0A0A), "RAW ACTOR STUDIO" wordmark top-left (Inter 600, small caps, letter-spacing .14em)
- Category pill top-right: amber bg (#C4A35A), dark text, e.g. "ON-CAMERA TECHNIQUE"
- Label: amber small caps (e.g., "AUDITION PREP")
- Headline: Bebas Neue or Oswald, ~72px, off-white #F0F0F0
- Body: Inter 300, ~28px, rgba(240,240,240,0.55)
- Bottom tagline: "Training That Meets Industry Reality." italic, muted

### 2. philosophy.html
- Dark bg (#0A0A0A), subtle grain texture overlay (CSS noise or SVG filter)
- Wordmark top-left (absolute positioned)
- Large italic quote: Playfair Display or DM Serif Display, ~76px, off-white
- Attribution: "— Sophie Ann Rooney, RAW Actor Studio"
- Gold accent bar at bottom (3px, #C4A35A)

### 3. enrollment.html
- Dark bg (#1A1714)
- "ENROLLMENT OPEN" or "LAST 3 SPOTS" urgency badge (gold bg, dark text, top-right)
- Class name large: Bebas Neue, ~64px (e.g., "THE MASTER — LEVEL 1")
- Details block: dates, price ($550 CAD), duration (6 weeks), location (21 College St)
- "RAW10" discount badge when applicable (amber-bordered pill)
- CTA: "Book at rawactorstudio.com" bottom
- Wordmark top-left

### 4. spotlight.html
- Dark bg with lighter card area (rgba(240,240,240,0.06) rounded card)
- Student quote in quotes, Inter 400, ~32px
- Student name + class taken below quote
- "RAW ACTOR STUDIO" wordmark top-left
- Small "STUDENT SPOTLIGHT" label in amber

### 5. behind-the-scenes.html
- Dark bg, atmospheric
- "IN THE ROOM" or "CLASS MOMENT" label in amber
- Large quote or observation text (Bebas Neue, ~60px)
- Subtext: context line (Inter 300, muted)
- Wordmark top-left
- Amber accent bar bottom

---

## Sessions Calendar Schema

`sessions.json`:
```json
[
  {
    "id": "master-2026-05",
    "class_name": "The Master (Level 1)",
    "start_date": "2026-05-05",
    "end_date": "2026-06-13",
    "price": 550,
    "currency": "CAD",
    "duration": "6 weeks",
    "enrollment_open": "2026-04-07",
    "early_bird_deadline": "2026-04-21",
    "discount_code": "RAW10",
    "discount_percent": 10,
    "max_spots": 12,
    "location": "21 College St, Toronto"
  }
]
```

---

## File Structure

```
RAW Marketing Pipeline/
├── package.json
├── brand-guidelines.md
├── content-strategy.md
├── sessions.json
├── campaigns.json
├── .env.example
├── PLAN.md                    # this file
├── CODEX_HANDOFF.md           # implementation instructions
├── templates/
│   ├── craft-tip.html
│   ├── philosophy.html
│   ├── enrollment.html
│   ├── spotlight.html
│   └── behind-the-scenes.html
├── scripts/
│   ├── generate.js            # session-aware Claude generation
│   ├── render.js              # Playwright → PNG
│   └── queue.js               # GitHub Contents API state
├── pending/
│   └── queue.json
├── approved-posts/
│   └── .gitkeep
└── api/
    └── telegram.js            # Vercel webhook (RAW bot)
```

---

## Telegram Bot Commands

| Command | Action |
|---------|--------|
| `/review` | Show next pending post for approval |
| `/status` | Queue counts (pending/approved) |
| `/regenerate` | Trigger GitHub Actions pipeline |
| `/sessions` | List upcoming class sessions with enrollment status |
| `/addsession` | Add new session (bot asks for class name, dates, price) |
| `/spotlight <name>` | Queue a student spotlight post (bot asks for quote/achievement) |
| `/enrollment` | Force-generate enrollment push for nearest upcoming session |
| (free text) | Revise current pending post via Claude |
| Approve/Skip buttons | Inline keyboard on each preview |

---

## GitHub Actions

```yaml
name: RAW Marketing Pipeline
on:
  schedule:
    - cron: '0 9 8,22 * *'   # 8th and 22nd monthly at 9am UTC
  workflow_dispatch:
```

Secrets needed:
- `ANTHROPIC_API_KEY`
- `RAW_TELEGRAM_BOT_TOKEN`
- `RAW_TELEGRAM_CHAT_ID`

---

## Implementation Tasks

1. Create directory structure + package.json + .env.example
2. Write brand-guidelines.md + content-strategy.md
3. Create sessions.json with current/upcoming classes
4. Build 5 HTML templates (1080x1080, dark brand)
5. Write generate.js (session-aware content generation via Claude)
6. Write render.js (Playwright → PNG)
7. Write queue.js (GitHub Contents API)
8. Create Telegram bot (@BotFather), write api/telegram.js webhook
9. Create GitHub Actions workflow
10. End-to-end test: trigger → generate → render → Telegram → approve → Buffer

---

## Phase 2 Expansion: Live Class Photos + Deadline Commentary

### Summary

Add two supplemental intake lanes without changing the main architecture:

1. Telegram class photo intake during live classes
2. Deadline article intake that creates actor-specific, thought-provoking commentary posts

These should sit on top of the existing system, not replace it. The scheduled RAW pipeline remains the baseline engine. These new lanes create better inventory, more real proof, and more visual variance.

### Goals

- Let Grisha send class photos to Telegram as classes happen
- Store those photos in a structured asset bank, not a random folder dump
- Link photos to sessions, source documents, and future posts
- Let Grisha send a Deadline URL and create a sharp actor-facing commentary post
- Keep commentary specific, useful, and provocative without turning into entertainment-news recap
- Improve design variance by giving the renderer real, tagged RAW imagery to use

---

## Live Class Photo Intake Plan

### Why This Matters

Right now the templates support photo-led layouts, but the usable photo pool is effectively empty. That forces the system toward text-led posts. Live class photo intake fixes that by feeding the design system real studio proof.

### User Flow

1. Grisha starts a class intake with `/class` or `/session start`
2. Grisha sends:
   - transcript text
   - voice notes
   - class photos
3. Telegram saves each photo and links it to the active class intake
4. The system stores photo metadata in a photo bank
5. Future posts can use those photos intentionally based on tags and context

### Telegram Commands / Behaviors

- `/session start`
  Starts a live class capture session
- `/class`
  Keeps existing transcript/audio flow
- `/classphoto`
  Optional explicit photo intake command if Grisha wants to send images outside a session
- `/session end`
  Closes the live capture session and summarizes what was saved
- `/asset-status`
  Shows recent stored photos and their review state

Recommended v1 behavior:

- If a class session is active, any incoming Telegram photo should be treated as class-photo intake automatically
- If no session is active, the bot should ask whether the photo is:
  - class room
  - event / open house
  - student spotlight
  - other

### Storage

Files:

- `photos/class-live/YYYY-MM-DD/`
- `photos/events/`
- `photos/headshots/`

Metadata:

- `pending/photo-bank.json`

### Photo Record Schema

```json
{
  "id": "photo-2026-04-05-001",
  "file_path": "photos/class-live/2026-04-05/photo-001.jpg",
  "telegram_file_id": "abc123",
  "submitted_at": "2026-04-05T20:13:00.000Z",
  "submitted_by": "grisha",
  "session_id": "master-2026-05",
  "source_document_id": "src-2026-04-05-class-a",
  "asset_type": "class_photo",
  "tags": ["class-wide", "teacher", "pair-work"],
  "consent_status": "internal_only",
  "quality_status": "usable",
  "notes": "Good room-wide image during notes section"
}
```

### Processing Rules

- Save original Telegram image locally
- Generate a stable file name and date-based folder
- Write a metadata record to `photo-bank.json`
- Link the photo to:
  - the active session if available
  - the active source document if a transcript/audio intake is in progress
- Optionally store a lightweight thumbnail later if performance becomes an issue

### Quality / Consent Rules

- Default new photos to `consent_status: internal_only` until reviewed
- Allow only `usable` photos to be picked automatically by the renderer
- Reject or downgrade:
  - blurry images
  - duplicate angles
  - images with awkward closed-eye / mid-speech framing
  - photos not cleared for marketing use

### Rendering Integration

Do not keep random photo selection as the long-term behavior.

Replace it with tagged asset selection:

- `craft-tip`
  prefers `teacher`, `whiteboard`, `pair-work`, `script-in-hand`
- `behind-the-scenes`
  prefers `class-wide`, `room-energy`, `monitor`, `coaching-moment`
- `spotlight`
  prefers `headshot`, `portrait`, `student`
- `enrollment`
  prefers `event`, `full-room`, `proof-of-community`
- `philosophy`
  should stay mostly text-led unless a strong portrait or room image supports it

### Scheduling / Feed Rules

- No more than 2 text-led posts in a row if usable photos exist
- Do not reuse the same photo within a 21-day window unless manually approved
- Prefer fresh class photos for Saturday proof / conversion posts
- Allow transcript-derived posts to request a linked class photo first before searching the wider photo bank

### Test Plan

- Start session -> send 3 photos -> verify files are stored and metadata is written
- Send transcript + photos in one session -> verify photo records link to the same source document
- Generate a photo-led post -> verify renderer uses tagged photo, not random photo
- Mark one image unusable -> verify it is excluded from automatic selection

---

## Deadline Commentary Intake Plan

### Why This Matters

Deadline content can help RAW look plugged into industry reality, but only if the post is transformed into actor-specific commentary. RAW should not sound like an entertainment-news account. The point is not "here is the news." The point is "here is what this shift means for actors and how to think about it."

### User Flow

1. Grisha sends `/deadline <url>`
2. The system fetches the article
3. It checks freshness, readability, and actor relevance
4. It generates 3-5 commentary angles
5. It promotes the strongest one or two into draft posts
6. Grisha reviews in Telegram like any other post

### Telegram Commands / Behaviors

- `/deadline <url>`
  Explicitly creates commentary-mode processing for Deadline links
- `/article <url>`
  Stays available for general industry article intake

Recommended rule:

- Deadline links should default to `thought-provoking commentary` mode
- Generic article links should keep the current educational / trend mode unless explicitly promoted into commentary

### Commentary Rules

Each Deadline-derived post must answer:

1. What changed?
2. Why should actors care?
3. What pressure, opportunity, or misconception does this reveal?
4. What should an actor do differently because of this?

The post should feel like an informed RAW take, not a recap.

### Commentary Angle Types

- `industry-implication`
- `career-pressure-point`
- `craft-meets-market`
- `myth-exposed`
- `actor-decision-frame`

### Draft Rules

- Lead with tension, not summary
- Avoid celebrity-gossip framing
- Avoid close paraphrase of the article
- Always translate the article into actor consequences
- Prefer one strong claim over five weak observations
- End with one of:
  - a reflective question
  - a practical actor takeaway
  - a soft CTA to audit / train / rethink process

### Deadline Commentary Record Additions

Add to article-derived source documents:

- `publication`
- `commentary_mode`
- `actor_relevance_score`
- `provocation_question`
- `market_signal`

Add to supplemental angle items:

- `discussion_frame`
- `actor_takeaway`
- `thought_tension`

### Example Commentary Shapes

- "This casting shift does not just change who gets seen. It changes how prepared actors need to be before they are seen."
- "If the industry is rewarding faster turnaround, actors who still rely on inspiration are going to feel the gap."
- "The article is not really about one show or one deal. It is about what the market is quietly demanding from actors now."

### Design Direction

Deadline commentary should not look like the normal quote cards.

Preferred treatments:

- editorial headline frame
- article-fragment + RAW response frame
- dark newsroom-style layout with one strong tension line
- optional class photo background only if it supports the actor implication visually

Avoid:

- screenshotting the article as the post
- generic "industry news" banners
- loud tabloid treatment

### Scheduling Rules

- Keep commentary supplemental, not mandatory
- No more than 1 commentary post per 7 days unless manually approved
- Freshness window should be tighter than normal article posts
- Strong Deadline commentary can replace a Thursday philosophy slot if the angle is brand-aligned

### Rejection Rules

Reject a Deadline article if:

- it is mostly gossip with no actor implication
- it is too old to create timely commentary
- it does not create a real decision, lesson, or pressure point for actors
- the generated take sounds generic or preachy

### Test Plan

- Submit strong Deadline article -> generate 3-5 commentary angles -> promote top 1-2 drafts
- Submit weak Deadline article -> source saved as rejected with a clear reason
- Submit older Deadline article -> freshness rejection recorded in source docs
- Review draft -> confirm it asks a real actor-facing question rather than summarizing the article

---

## Implementation Order For This Expansion

1. Add `photo-bank.json` and local class-photo folders
2. Extend Telegram intake to accept and store `message.photo`
3. Link stored photos to active sessions and source documents
4. Update renderer to use tagged assets instead of random image selection
5. Add `/deadline <url>` command and commentary-mode processing
6. Extend source document + supplemental angle schemas for commentary metadata
7. Add prompt rules for thought-provoking actor-facing commentary
8. Add queue diversity rules so fresh class photos are actually used
9. Test full live flow:
   - class transcript + class photos
   - Deadline link -> commentary draft
   - Telegram review -> render -> approval
