# Skill Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate three skills from ericosiu/ai-marketing-skills into the RAW Marketing Pipeline: Podcast-Ops (RSS → transcript → angles), Expert Panel (quality-gate captions before review), and Growth Engine (track approve/reject outcomes + weekly scorecard).

**Architecture:** Each skill maps to one new `scripts/lib/` module. Expert panel wraps the existing `generatePostFromBrief` call in `generation.js`. Growth engine hooks into the approve/reject flow in `telegram.js`. Podcast-Ops adds a `/podcast` command that fetches RSS, downloads episode audio, and routes it through the existing transcript pipeline. All new persistent state lives in `pending/`.

**Tech Stack:** Node.js 20 ESM, `@anthropic-ai/sdk`, OpenAI Whisper (already used), native `fetch`, existing `callAnthropicJson` pattern from `sources.js`.

---

## File Map

| File | Change | Purpose |
|------|--------|---------|
| `scripts/lib/expert-panel.js` | **Create** | Expert panel scoring + revision loop |
| `scripts/lib/podcast.js` | **Create** | RSS fetch, episode list, audio download → transcript pipeline |
| `scripts/lib/growth.js` | **Create** | Log outcomes, compute scorecard |
| `scripts/lib/generation.js` | **Modify** | Call expert panel after draft (when `RAW_EXPERT_PANEL=1`) |
| `scripts/lib/raw-core.js` | **Modify** | Add `DATA_PATHS.experiments` |
| `scripts/queue.js` | **Modify** | Add `getExperiments` / `saveExperiments` |
| `api/telegram.js` | **Modify** | Add `/podcast`, `/scorecard` commands; log outcomes on approve/reject |
| `pending/ab-experiments.json` | **Create** | Experiment outcome store |

---

## Task 1: Expert Panel — `scripts/lib/expert-panel.js`

**Files:**
- Create: `scripts/lib/expert-panel.js`

The expert panel asks Claude to score a post as three experts. If total < 85, it requests one specific revision from the model and retries once. Max 2 total attempts.

Experts:
1. **Casting Director** — Does this read as a serious professional studio?
2. **Sophie (RAW Director)** — Does this match how RAW actually teaches?
3. **Working Toronto Actor** — Is this genuinely useful, or generic noise?

Dimensions (20 pts each, total 100):
- `brand_voice` — Direct, craft-specific, not generic motivation
- `hook_specificity` — Concrete acting concept, not vague abstraction
- `copy_accuracy` — No invented facts, no vague outcome promises
- `cta_clarity` — One clear next step, no pressure
- `originality` — Fresh opening shape, not a pattern repeat

- [ ] **Step 1: Create `scripts/lib/expert-panel.js`**

```js
import { normalizeText } from "./raw-core.js";

const PANEL_THRESHOLD = 85;
const MAX_ATTEMPTS = 2;

function buildPanelSystemPrompt() {
  return `You are a three-person expert review panel for RAW Actor Studio Instagram content.

Panel members:
1. Casting Director — evaluates professional credibility and industry voice
2. Sophie (RAW Acting Coach) — evaluates alignment with RAW's teaching philosophy
3. Working Toronto Actor — evaluates practical usefulness vs. generic noise

Score each dimension 0–20. Be strict. Generic acting content that could come from any studio scores low on brand_voice. Vague emotional language scores low on hook_specificity. Invented results or promises score 0 on copy_accuracy.`;
}

function buildPanelPrompt(post) {
  return `Score this RAW Actor Studio Instagram post and return JSON only.

Post:
Headline: ${post.headline}
Image body: ${post.image_body}
Caption: ${post.caption}

Scoring dimensions (0–20 each):
- brand_voice: Direct, craft-specific, sounds like RAW specifically
- hook_specificity: Concrete acting concept, not vague motivation
- copy_accuracy: No invented facts or vague outcome promises
- cta_clarity: One clear next step, no pressure tactics
- originality: Fresh opening, not a pattern repeat

Return:
{
  "scores": {
    "brand_voice": 0,
    "hook_specificity": 0,
    "copy_accuracy": 0,
    "cta_clarity": 0,
    "originality": 0
  },
  "total": 0,
  "weakest_dimension": "brand_voice",
  "revision_instruction": "One specific fix to improve the weakest dimension"
}`;
}

function buildRevisionPrompt(post, panelResult) {
  return `Revise this RAW Actor Studio post to address one specific issue. Return JSON only.

Current post:
${JSON.stringify({ headline: post.headline, image_body: post.image_body, caption: post.caption }, null, 2)}

Expert panel revision instruction:
${panelResult.revision_instruction}

Weakest dimension: ${panelResult.weakest_dimension} (scored ${panelResult.scores[panelResult.weakest_dimension]}/20)

Return the same JSON shape as the input post — only change headline, image_body, and caption if needed to address the issue. Do not change type, cta_type, proof_sources, hashtags, or any metadata field.

Return:
{
  "headline": "...",
  "image_body": "...",
  "caption": "..."
}`;
}

async function callAnthropicJson({ system, prompt, maxTokens = 1000 }) {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const jsonStr = fenced ? fenced[1].trim() : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(jsonStr);
}

async function scorePost(post) {
  const result = await callAnthropicJson({
    system: buildPanelSystemPrompt(),
    prompt: buildPanelPrompt(post),
    maxTokens: 600
  });

  const scores = result.scores || {};
  const total =
    result.total ||
    Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    scores,
    total,
    weakest_dimension: result.weakest_dimension || "brand_voice",
    revision_instruction: result.revision_instruction || "Tighten the brand voice."
  };
}

async function applyRevision(post, panelResult) {
  const patch = await callAnthropicJson({
    system: buildPanelSystemPrompt(),
    prompt: buildRevisionPrompt(post, panelResult),
    maxTokens: 800
  });

  return {
    ...post,
    headline: String(patch.headline || post.headline).trim(),
    image_body: String(patch.image_body || post.image_body).trim(),
    caption: String(patch.caption || post.caption).trim()
  };
}

export async function runExpertPanel(post, { mock = false } = {}) {
  if (mock || !process.env.ANTHROPIC_API_KEY) {
    return {
      post,
      panel_score: null,
      panel_attempts: 0,
      panel_passed: true
    };
  }

  let current = post;
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    lastResult = await scorePost(current);

    if (lastResult.total >= PANEL_THRESHOLD) {
      return {
        post: current,
        panel_score: lastResult.total,
        panel_attempts: attempt,
        panel_passed: true
      };
    }

    if (attempt < MAX_ATTEMPTS) {
      current = await applyRevision(current, lastResult);
    }
  }

  // Return best version even if it didn't hit threshold — lint will flag it
  return {
    post: current,
    panel_score: lastResult?.total ?? null,
    panel_attempts: MAX_ATTEMPTS,
    panel_passed: (lastResult?.total ?? 0) >= PANEL_THRESHOLD
  };
}
```

- [ ] **Step 2: Verify syntax**

```powershell
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
node --check scripts/lib/expert-panel.js
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/expert-panel.js
git commit -m "feat(raw): add expert panel quality-gate for post scoring"
```

---

## Task 2: Wire Expert Panel into `generation.js`

**Files:**
- Modify: `scripts/lib/generation.js`

Add expert panel as an optional post-generation step, gated by `RAW_EXPERT_PANEL=1`. It runs after `generatePostFromBrief` builds the post record and annotates the record with `panel_score` and `panel_passed`.

- [ ] **Step 1: Add import to top of `scripts/lib/generation.js`**

After the existing imports block (line 15 area), add:

```js
import { runExpertPanel } from "./expert-panel.js";
```

- [ ] **Step 2: Modify `generatePostFromBrief` to call expert panel**

Find this block near the end of `generatePostFromBrief` (around line 600–610):

```js
  return buildPostRecord(
    {
      ...draft,
      cta_type: brief.cta_type,
      cta_url: brief.cta_url
    },
    brief,
    lintResult
  );
```

Replace with:

```js
  const baseRecord = buildPostRecord(
    {
      ...draft,
      cta_type: brief.cta_type,
      cta_url: brief.cta_url
    },
    brief,
    lintResult
  );

  if (process.env.RAW_EXPERT_PANEL === "1" && !mock) {
    const panelResult = await runExpertPanel(baseRecord, { mock });
    const panelNotes = panelResult.panel_passed
      ? []
      : [
          {
            source: "expert-panel",
            note: `Panel score ${panelResult.panel_score}/100 after ${panelResult.panel_attempts} attempt(s). Did not reach threshold.`,
            recorded_at: new Date().toISOString()
          }
        ];
    return {
      ...panelResult.post,
      status: panelResult.panel_passed ? baseRecord.status : "needs_revision",
      panel_score: panelResult.panel_score,
      panel_attempts: panelResult.panel_attempts,
      panel_passed: panelResult.panel_passed,
      review_notes: [...(baseRecord.review_notes || []), ...panelNotes]
    };
  }

  return baseRecord;
```

- [ ] **Step 3: Verify syntax**

```powershell
node --check scripts/lib/generation.js
```

Expected: no output.

- [ ] **Step 4: Smoke test mock generation still works**

```powershell
node scripts/generate.js --mock --force --count 1
```

Expected: `Generated 1 post(s). Queue size: 1.`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/generation.js
git commit -m "feat(raw): wire expert panel into post generation (opt-in via RAW_EXPERT_PANEL=1)"
```

---

## Task 3: Growth Engine — `scripts/lib/growth.js`

**Files:**
- Create: `scripts/lib/growth.js`

Tracks approve/reject outcomes per post. Computes weekly scorecard grouped by pillar, type, and content_origin. No external API required — uses the existing review log in `review-memory.json` plus a new `pending/ab-experiments.json` for richer outcome data.

- [ ] **Step 1: Create `scripts/lib/growth.js`**

```js
import { getTodayIso } from "./raw-core.js";

export function recordOutcome(experiments, post, outcome, reason = null) {
  const entry = {
    date: getTodayIso(),
    post_date: post.date,
    angle_id: post.angle_id,
    type: post.type,
    pillar:
      post.type === "craft-tip"
        ? "craft"
        : post.type === "philosophy"
          ? "philosophy"
          : "conversion",
    content_origin: post.content_origin || "system",
    panel_score: post.panel_score ?? null,
    outcome,
    reason: reason || null,
    recorded_at: new Date().toISOString()
  };

  return {
    updated_at: new Date().toISOString(),
    outcomes: [...(experiments.outcomes || []), entry]
  };
}

function rate(approved, total) {
  if (total === 0) return "n/a";
  return `${Math.round((approved / total) * 100)}% (${approved}/${total})`;
}

function groupBy(outcomes, key) {
  const groups = {};
  for (const outcome of outcomes) {
    const value = outcome[key] || "unknown";
    if (!groups[value]) {
      groups[value] = { approved: 0, total: 0 };
    }
    groups[value].total += 1;
    if (outcome.outcome === "approved") {
      groups[value].approved += 1;
    }
  }
  return groups;
}

function topRejectionReasons(outcomes) {
  const counts = {};
  for (const outcome of outcomes) {
    if (outcome.outcome === "rejected" && outcome.reason) {
      counts[outcome.reason] = (counts[outcome.reason] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

function bestPerformingAngle(outcomes) {
  const stats = {};
  for (const outcome of outcomes) {
    const id = outcome.angle_id;
    if (!id) continue;
    if (!stats[id]) stats[id] = { approved: 0, total: 0 };
    stats[id].total += 1;
    if (outcome.outcome === "approved") stats[id].approved += 1;
  }

  return Object.entries(stats)
    .filter(([, s]) => s.total >= 2)
    .sort((left, right) => {
      const rateLeft = left[1].approved / left[1].total;
      const rateRight = right[1].approved / right[1].total;
      return rateRight - rateLeft || right[1].total - left[1].total;
    })
    .slice(0, 3)
    .map(([id, s]) => `${id}: ${rate(s.approved, s.total)}`);
}

export function buildScorecard(experiments, windowDays = 28) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const outcomes = (experiments.outcomes || []).filter(
    (outcome) => new Date(outcome.recorded_at) >= cutoff
  );

  if (!outcomes.length) {
    return `RAW Growth Scorecard — no outcomes recorded in the last ${windowDays} days.\n\nApprove or reject posts via /review to start tracking.`;
  }

  const byPillar = groupBy(outcomes, "pillar");
  const byType = groupBy(outcomes, "type");
  const byOrigin = groupBy(outcomes, "content_origin");
  const reasons = topRejectionReasons(outcomes);
  const best = bestPerformingAngle(outcomes);

  const totalApproved = outcomes.filter((o) => o.outcome === "approved").length;
  const lines = [
    `RAW Growth Scorecard — last ${windowDays} days`,
    `Total posts reviewed: ${outcomes.length} | Approved: ${totalApproved}`,
    "",
    "By pillar:",
    ...Object.entries(byPillar).map(
      ([key, s]) => `  ${key}: ${rate(s.approved, s.total)}`
    ),
    "",
    "By template type:",
    ...Object.entries(byType).map(
      ([key, s]) => `  ${key}: ${rate(s.approved, s.total)}`
    ),
    "",
    "By content origin:",
    ...Object.entries(byOrigin).map(
      ([key, s]) => `  ${key}: ${rate(s.approved, s.total)}`
    )
  ];

  if (reasons.length) {
    lines.push("", "Top rejection reasons:");
    lines.push(...reasons.map(([reason, count]) => `  ${reason}: ${count}`));
  }

  if (best.length) {
    lines.push("", "Best-performing angles:");
    lines.push(...best.map((entry) => `  ${entry}`));
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Verify syntax**

```powershell
node --check scripts/lib/growth.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/growth.js
git commit -m "feat(raw): add growth engine for outcome tracking and weekly scorecards"
```

---

## Task 4: Wire Growth Engine into `queue.js` and `raw-core.js`

**Files:**
- Modify: `scripts/lib/raw-core.js` — add `DATA_PATHS.experiments`
- Modify: `scripts/queue.js` — add `getExperiments` / `saveExperiments`
- Create: `pending/ab-experiments.json`

- [ ] **Step 1: Add `experiments` to `DATA_PATHS` in `scripts/lib/raw-core.js`**

Find the `DATA_PATHS` object (around line 25–38). Add one entry:

```js
  experiments: path.join(ROOT_DIR, "pending", "ab-experiments.json"),
```

- [ ] **Step 2: Add path mapping in `scripts/queue.js`**

Find the `directMap` object inside `resolveLocalPath` (around line 85–93). Add:

```js
    "pending/ab-experiments.json": DATA_PATHS.experiments,
```

- [ ] **Step 3: Add `getExperiments` and `saveExperiments` to `scripts/queue.js`**

After the `getSupplementalBank` / `saveSupplementalBank` export block (around line 280), add:

```js
export async function getExperiments(
  token,
  repo,
  targetPath = "pending/ab-experiments.json"
) {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: {
      updated_at: null,
      outcomes: []
    }
  });

  return {
    experiments: data,
    sha
  };
}

export async function saveExperiments(
  token,
  repo,
  experiments,
  sha = null,
  targetPath = "pending/ab-experiments.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: experiments,
    sha,
    message: `chore(raw): update experiments ${getTodayIso()}`
  });
}
```

- [ ] **Step 4: Create `pending/ab-experiments.json`**

```json
{
  "updated_at": null,
  "outcomes": []
}
```

Save to `pending/ab-experiments.json`.

- [ ] **Step 5: Verify syntax on both modified files**

```powershell
node --check scripts/lib/raw-core.js
node --check scripts/queue.js
```

Expected: no output from either.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/raw-core.js scripts/queue.js pending/ab-experiments.json
git commit -m "feat(raw): add experiments store and queue helpers for growth engine"
```

---

## Task 5: Podcast-Ops — `scripts/lib/podcast.js`

**Files:**
- Create: `scripts/lib/podcast.js`

Fetches an RSS feed, parses episode list, downloads the latest episode's audio, transcribes via the existing `transcribeAudioBuffer`, and routes the transcript through the existing `processClassTranscriptSource`. The `/podcast` Telegram command drives this.

- [ ] **Step 1: Create `scripts/lib/podcast.js`**

```js
import { getTodayIso } from "./raw-core.js";
import { transcribeAudioBuffer } from "./sources.js";

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanText(decodeEntities(match[1].replace(/<[^>]+>/g, ""))) : "";
}

function extractAttr(xml, tag, attr) {
  const match = xml.match(new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, "i"));
  return match ? match[1].trim() : "";
}

function parseEpisodes(rssXml) {
  const items = [...rssXml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(
    (match) => match[1]
  );

  return items
    .map((item) => {
      const title = extractTag(item, "title");
      const audioUrl =
        extractAttr(item, "enclosure", "url") ||
        extractAttr(item, "media:content", "url") ||
        "";
      const mimeType = extractAttr(item, "enclosure", "type") || "audio/mpeg";
      const pubDate = extractTag(item, "pubDate");
      return { title, audioUrl, mimeType, pubDate };
    })
    .filter((episode) => episode.audioUrl);
}

export async function fetchRssFeed(rssUrl) {
  const response = await fetch(rssUrl, {
    headers: { "User-Agent": "RAW Marketing Pipeline/1.0" }
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const episodes = parseEpisodes(xml);

  if (!episodes.length) {
    throw new Error("RSS feed contained no episodes with audio URLs.");
  }

  return episodes;
}

export async function downloadEpisodeAudio(episode) {
  const response = await fetch(episode.audioUrl, {
    headers: { "User-Agent": "RAW Marketing Pipeline/1.0" }
  });

  if (!response.ok) {
    throw new Error(`Episode audio download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const fileName = episode.audioUrl.split("/").pop()?.split("?")[0] || `episode-${Date.now()}.mp3`;
  const mimeType = episode.mimeType || "audio/mpeg";

  return { buffer, fileName, mimeType };
}

export async function processPodcastEpisode({
  rssUrl,
  episodeIndex = 0,
  submittedBy,
  data,
  sourceDocuments,
  supplementalBank,
  queue,
  mock = false
}) {
  const { processClassTranscriptSource } = await import("./sources.js");

  const episodes = await fetchRssFeed(rssUrl);
  const episode = episodes[episodeIndex];

  if (!episode) {
    throw new Error(`Episode index ${episodeIndex} not found. Feed has ${episodes.length} episode(s).`);
  }

  const { buffer, fileName, mimeType } = await downloadEpisodeAudio(episode);
  const transcript = await transcribeAudioBuffer({ buffer, fileName, mimeType });

  return processClassTranscriptSource({
    transcriptText: transcript,
    title: episode.title || `Podcast episode ${getTodayIso()}`,
    submittedBy,
    sourceType: "podcast_episode",
    data,
    sourceDocuments,
    supplementalBank,
    queue,
    mock
  });
}

export function formatEpisodeList(episodes, limit = 5) {
  return episodes
    .slice(0, limit)
    .map((episode, index) => `${index}. ${episode.title} (${episode.pubDate || "no date"})`)
    .join("\n");
}
```

- [ ] **Step 2: Verify syntax**

```powershell
node --check scripts/lib/podcast.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/podcast.js
git commit -m "feat(raw): add podcast-ops RSS intake and episode transcription"
```

---

## Task 6: Wire Podcast + Growth Engine into `api/telegram.js`

**Files:**
- Modify: `api/telegram.js`

Four changes:
1. Import `processPodcastEpisode`, `fetchRssFeed`, `formatEpisodeList` from podcast module
2. Import `recordOutcome`, `buildScorecard` from growth module
3. Import `getExperiments`, `saveExperiments` from queue module
4. Add `/podcast` command handler
5. Add `/scorecard` command handler
6. Log outcome in the `apr` (approve) callback
7. Log outcome in the `rsn` (reason/reject) callback
8. Load experiments in the main `handler` context
9. Persist experiments in `persistContext`

- [ ] **Step 1: Add imports to top of `api/telegram.js`**

After the existing import block (around line 26), add:

```js
import { processPodcastEpisode, fetchRssFeed, formatEpisodeList } from "../scripts/lib/podcast.js";
import { recordOutcome, buildScorecard } from "../scripts/lib/growth.js";
import {
  getExperiments,
  saveExperiments
} from "../scripts/queue.js";
```

- [ ] **Step 2: Add `experiments` and `experimentsSha` to `persistContext`**

Find `persistContext` (around line 474). Add a new `if` block after the `supplementalBank` block:

```js
  if (fields.includes("experiments")) {
    tasks.push(
      saveExperiments(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_REPO,
        context.experiments,
        context.experimentsSha
      )
    );
  }
```

- [ ] **Step 3: Add `/podcast` and `/scorecard` command handlers to `handleTextMessage`**

Find the `/spotlight` command handler block (ends around line 712). After it, add:

```js
  if (lower.startsWith("/scorecard")) {
    const scorecard = buildScorecard(context.experiments);
    await sendMessage(chatId, scorecard);
    return;
  }

  if (lower.startsWith("/podcast")) {
    const remainder = text.replace(/^\/podcast/i, "").trim();

    if (!remainder) {
      await sendMessage(chatId, "Use /podcast <rss_url> to ingest the latest episode, or /podcast <rss_url> <index> for a specific episode.");
      return;
    }

    const parts = remainder.split(/\s+/);
    const rssUrl = parts[0];
    const episodeIndex = parts[1] ? Number(parts[1]) : 0;

    if (!rssUrl.startsWith("http")) {
      await sendMessage(chatId, "Provide a full RSS URL starting with http.");
      return;
    }

    // If no index given, show episode list first and default to latest
    if (!parts[1]) {
      const episodes = await fetchRssFeed(rssUrl);
      const list = formatEpisodeList(episodes);
      await sendMessage(
        chatId,
        `Found ${episodes.length} episode(s). Processing episode 0 (latest):\n\n${list}\n\nTo pick a different episode: /podcast ${rssUrl} <index>`
      );
    }

    const result = await processPodcastEpisode({
      rssUrl,
      episodeIndex,
      submittedBy: update.message.from?.username || String(update.message.from?.id || "unknown"),
      data: context.data,
      sourceDocuments: context.sourceDocuments,
      supplementalBank: context.supplementalBank,
      queue: context.queue,
      mock: !process.env.ANTHROPIC_API_KEY
    });

    context.sourceDocuments = result.sourceDocuments;
    context.supplementalBank = result.supplementalBank;
    context.queue = result.queue;

    await persistContext(context, ["queue", "sourceDocuments", "supplementalBank"]);
    await sendMessage(chatId, summarizeSourceResult(result));
    return;
  }
```

- [ ] **Step 4: Log outcome in the `apr` (approve) callback in `handleCallback`**

Find the `if (action === "apr")` block (around line 816). After `context.reviewMemory.updated_at = new Date().toISOString();` and before `await persistContext(...)`, add:

```js
    context.experiments = recordOutcome(context.experiments, post, "approved");
```

Then add `"experiments"` to the `persistContext` call:

```js
    await persistContext(context, ["queue", "reviewMemory", "experiments"]);
```

- [ ] **Step 5: Log outcome in the `rsn` (reason/reject) callback in `handleCallback`**

Find the `if (action === "rsn")` block (around line 871). After `context.reviewMemory.updated_at = new Date().toISOString();` and before `await persistContext(...)`, add:

```js
    context.experiments = recordOutcome(context.experiments, post, "rejected", reason);
```

Then add `"experiments"` to the `persistContext` call:

```js
    await persistContext(context, ["queue", "reviewMemory", "experiments"]);
```

- [ ] **Step 6: Load experiments in the `handler` function context**

Find the `Promise.all` in the main `handler` function (around line 930). Change it from:

```js
    const [queueState, reviewMemoryState, sourceDocumentState, supplementalState, data] =
      await Promise.all([
        getQueue(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getReviewMemory(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSourceDocuments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSupplementalBank(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        loadProjectData()
      ]);
```

To:

```js
    const [queueState, reviewMemoryState, sourceDocumentState, supplementalState, experimentsState, data] =
      await Promise.all([
        getQueue(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getReviewMemory(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSourceDocuments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSupplementalBank(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getExperiments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        loadProjectData()
      ]);
```

Then add to the `context` object:

```js
      experiments: experimentsState.experiments,
      experimentsSha: experimentsState.sha,
```

- [ ] **Step 7: Verify syntax**

```powershell
node --check api/telegram.js
```

Expected: no output.

- [ ] **Step 8: Run local mock test of existing commands**

```powershell
node scripts/generate.js --mock --force --count 2
```

Expected: `Generated 2 post(s). Queue size: 2.`

- [ ] **Step 9: Commit**

```bash
git add api/telegram.js
git commit -m "feat(raw): add /podcast and /scorecard commands, log outcomes to growth engine"
```

---

## Task 7: Update `.env.example`

**Files:**
- Modify: `.env.example`

Add the new opt-in flags.

- [ ] **Step 1: Add new env vars to `.env.example`**

Find the existing `.env.example` and append:

```
# Expert panel quality gate (set to 1 to enable — adds ~2 API calls per post)
RAW_EXPERT_PANEL=

# Optional: override transcript/article angle targets
RAW_TRANSCRIPT_ANGLE_TARGET=12
RAW_ARTICLE_ANGLE_TARGET=4
RAW_TRANSCRIPT_PROMOTE_COUNT=3
RAW_ARTICLE_PROMOTE_COUNT=2
RAW_ARTICLE_MAX_AGE_DAYS=10
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(raw): document new env vars for expert panel and source pipeline"
```

---

## Self-Review

**Spec coverage:**
- Podcast-Ops: ✅ RSS fetch → episode list → audio download → Whisper transcription → existing transcript pipeline
- Expert Panel: ✅ 3-expert scoring → revision loop → `panel_score`/`panel_passed` fields on post record
- Growth Engine: ✅ outcome logging on approve/reject, `/scorecard` command, grouped by pillar/type/origin

**Placeholder scan:** No TBD or TODO items. All code blocks are complete.

**Type consistency:**
- `runExpertPanel` returns `{ post, panel_score, panel_attempts, panel_passed }` — matches what `generatePostFromBrief` spreads onto the record ✅
- `recordOutcome` returns `{ updated_at, outcomes }` — matches `getExperiments` fallback shape ✅
- `processPodcastEpisode` returns same shape as `processClassTranscriptSource` (used in `summarizeSourceResult`) ✅
- `getExperiments` / `saveExperiments` follow exact same pattern as `getSupplementalBank` / `saveSupplementalBank` ✅
- `context.experiments` / `context.experimentsSha` added consistently in handler load and persistContext ✅

**Edge cases covered:**
- Expert panel is a no-op when `RAW_EXPERT_PANEL` is unset or `mock=true` — existing pipeline unchanged by default ✅
- `/podcast` with no RSS URL gives clear usage message ✅
- `/podcast` with no episode index defaults to 0 and shows episode list first ✅
- Growth engine scorecard handles zero outcomes gracefully ✅
- `parseEpisodes` filters out items with no audio URL ✅
