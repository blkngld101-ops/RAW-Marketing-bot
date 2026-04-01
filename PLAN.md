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
