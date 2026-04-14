# RAW Marketing — Four Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship attribution photo fix, Deadline commentary mode, live class photo intake with session commands, and Brand Training style reference for AI image composition.

**Architecture:** Four independent changes to `rendering.js`, `sources.js`, `scripts/queue.js` + `api/telegram.js`, and `scripts/lib/image-compose.js`. Each task produces a working commit. No shared state between tasks — implement in any order, though Task 4 (photo bank infra) must precede Task 5 (session commands) and Task 6 (renderer integration).

**Tech Stack:** Node.js ESM, OpenAI SDK v6, GitHub Contents API (state store), Telegram Bot API, Playwright (rendering), Anthropic SDK (Claude generation)

---

## File Map

| File | Change |
|---|---|
| `scripts/lib/rendering.js` | Task 1: attribution_photo_url fallback; Task 6: bankPhotoUrls in loadAssets + resolvePostPhoto |
| `scripts/lib/sources.js` | Task 3: isDeadlineUrl, buildDeadlineSystemPrompt, buildDeadlinePrompt, hasRecentCommentaryPost, analyzeArticle commentary flag, processArticleSource commentary mode |
| `scripts/queue.js` | Task 4: getPhotoBank, savePhotoBank |
| `pending/photo-bank.json` | Task 4: create empty bank |
| `api/telegram.js` | Task 5: import getPhotoBank/savePhotoBank, load photoBank in handler, add to context, extend persistContext, add /session command, modify handlePhotoMessage, update /help |
| `scripts/lib/image-compose.js` | Task 7: pickBrandRefPhoto, composeImage uses style ref as second image |
| `photos/brand-ref/` | Task 7: create directory (user populates with JPG/PNG reference images) |

---

## Task 1: attribution_photo_url fix in rendering.js

**Files:**
- Modify: `scripts/lib/rendering.js:95`

- [ ] **Step 1: Apply the fix**

In `scripts/lib/rendering.js`, find line 95:
```js
const explicitUrl = post.media?.image_url || post.photo_url || "";
```
Change to:
```js
const explicitUrl = post.media?.image_url || post.photo_url || post.attribution_photo_url || "";
```

- [ ] **Step 2: Verify manually**

Check that `resolvePostPhoto` still returns `{ photoUrl: "", photoBgSrc: "" }` for `layout_variant === "type-only"` (line 89-91 is unchanged). No automated test needed — the change is trivially correct.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add scripts/lib/rendering.js
git commit -m "fix: use attribution_photo_url as photo fallback for philosophy posts"
```

---

## Task 2: Commit existing unstaged changes

**Files:**
- Modify: `scripts/lib/raw-core.js` (quoteBank DATA_PATHS + loadProjectData)
- Modify: `content-strategy.md`, `PLAN.md`

- [ ] **Step 1: Stage and commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add scripts/lib/raw-core.js content-strategy.md PLAN.md
git commit -m "feat: wire quoteBank into generation pipeline; add Phase 2 content strategy"
```

> The `raw-core.js` changes load `quote-bank.json` into `data.quoteBank` so `generation.js` can inject the 71-quote bank into philosophy post prompts. Previously `data.quoteBank` was always undefined and the quote section was silently skipped.

---

## Task 3: Deadline Commentary Mode in sources.js

**Files:**
- Modify: `scripts/lib/sources.js`

All changes are additions to `sources.js`. Do not touch `telegram.js` — auto-detection handles routing.

- [ ] **Step 1: Add isDeadlineUrl helper and constants**

After line 21 (`const DEFAULT_ARTICLE_MAX_AGE_DAYS = ...`), add:

```js
const DEADLINE_COMMENTARY_MAX_AGE_DAYS = 7;

function isDeadlineUrl(url) {
  return /deadline\.com/i.test(String(url || ""));
}

function hasRecentCommentaryPost(sourceDocuments) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (sourceDocuments.documents || []).some(
    (doc) =>
      doc.commentary_mode === true &&
      doc.processing_status !== "rejected" &&
      new Date(doc.submitted_at || 0).getTime() > sevenDaysAgo
  );
}
```

- [ ] **Step 2: Add buildDeadlineSystemPrompt**

After `buildArticleSystemPrompt` (currently ends around line 428), add:

```js
function buildDeadlineSystemPrompt(data) {
  return `
You are RAW Actor Studio's industry commentary engine.

You do NOT recap entertainment news. You translate industry signals into actor-facing insight.

Every angle you produce must answer:
1. What changed or is happening in the industry?
2. Why should actors care — what pressure, opportunity, or misconception does this reveal?
3. What should an actor do differently, think about, or watch out for?

Rules:
- Lead with tension, not summary
- Reject gossip with no real actor implication
- Prefer one strong claim over five weak observations
- Do not closely paraphrase the article
- Every angle must feel like informed RAW commentary, not entertainment reporting

BRAND CORE
${data.brandCore}

CONTENT STRATEGY
${data.contentStrategy}
`;
}
```

- [ ] **Step 3: Add buildDeadlinePrompt**

After `buildDeadlineSystemPrompt`, add:

```js
function buildDeadlinePrompt(sourceDocument, targetCount) {
  return `
Analyze this Deadline article for RAW Actor Studio. Return JSON only.

Target angle count: ${targetCount}
If the article has no real actor implication, return relevant=false and no angles.

Article title: ${sourceDocument.title}
URL: ${sourceDocument.source_url}
Published at: ${sourceDocument.published_at || "unknown"}
Body:
${clipText(sourceDocument.raw_text, 18000)}

Return:
{
  "relevant": true,
  "rejection_reason": "",
  "extracted_summary": "brief actor-facing summary",
  "market_signal": "one sentence on what this reveals about the industry right now",
  "tags": ["tag"],
  "angles": [
    {
      "hook": "tension-first hook, max 12 words",
      "pillar": "craft|philosophy|conversion",
      "angle_type": "industry-implication|career-pressure-point|craft-meets-market|myth-exposed|actor-decision-frame",
      "actor_relevance": "specific consequence for working actors",
      "thought_tension": "the uncomfortable truth this angle surfaces",
      "actor_takeaway": "one concrete thing an actor should do or think differently",
      "discussion_frame": "how RAW would frame this in a class context",
      "proof_notes": ["proof note"],
      "suggested_template_family": "craft-tip|philosophy|behind-the-scenes",
      "score": 0,
      "acting_concept": "short concept",
      "problem": "specific actor problem",
      "tool": "specific action or lens",
      "cta_type": "soft|audit|proof",
      "audience_stage": "cold|warm|hot",
      "keywords": ["keyword"],
      "source_excerpt": "paraphrased signal from article",
      "freshness_window": "7d"
    }
  ]
}
`;
}
```

- [ ] **Step 4: Add commentary flag to analyzeArticle**

Find `async function analyzeArticle(sourceDocument, data, targetCount, mock)` (around line 496). Change signature and body:

```js
async function analyzeArticle(sourceDocument, data, targetCount, mock, commentary = false) {
  if (mock || !process.env.ANTHROPIC_API_KEY) {
    return {
      relevant: true,
      rejection_reason: "",
      extracted_summary: firstSentence(sourceDocument.raw_text),
      tags: ["industry", "actors", "trend"],
      angles: buildMockArticleAngles(sourceDocument, targetCount)
    };
  }

  const result = await callAnthropicJson({
    system: commentary ? buildDeadlineSystemPrompt(data) : buildArticleSystemPrompt(data),
    prompt: commentary ? buildDeadlinePrompt(sourceDocument, targetCount) : buildArticlePrompt(sourceDocument, targetCount),
    maxTokens: 2600
  });

  return {
    relevant: Boolean(result.relevant),
    rejection_reason: cleanText(result.rejection_reason || ""),
    extracted_summary: cleanText(result.extracted_summary || ""),
    tags: (result.tags || []).map((tag) => cleanText(tag)).filter(Boolean).slice(0, 10),
    angles: (result.angles || []).map((angle, index) =>
      normalizeAngleItem(angle, sourceDocument, index)
    )
  };
}
```

- [ ] **Step 5: Modify processArticleSource**

Find `export async function processArticleSource({` (around line 775). Add commentary detection and cap check at the very top of the function body, before the stub document creation, and tighten the age check:

After the function signature opening `{`, as the very first lines:
```js
  const commentary = isDeadlineUrl(sourceUrl);

  // Cap check: one commentary post per 7 days.
  // Throws so the Telegram catch handler shows the message naturally.
  if (commentary && hasRecentCommentaryPost(sourceDocuments)) {
    throw new Error("Commentary cap: one Deadline post per 7 days. Try again next week.");
  }
```

Find the age check (~line 823):
```js
  if (ageDays !== null && ageDays > DEFAULT_ARTICLE_MAX_AGE_DAYS) {
```
Change to:
```js
  const maxAgeDays = commentary ? DEADLINE_COMMENTARY_MAX_AGE_DAYS : DEFAULT_ARTICLE_MAX_AGE_DAYS;
  if (ageDays !== null && ageDays > maxAgeDays) {
```
And update the rejection note in that block from:
```js
`Article is too old for trend content (${ageDays} days).`
```
to:
```js
`Article is too old (${ageDays} days, max ${maxAgeDays}).`
```

Find the block that updates the stub with real content (~line 842):
```js
  sourceDocument = {
    ...sourceDocument,
    title: article.title,
    raw_text: article.text,
    published_at: article.publishedAt || null
  };
```
Change to:
```js
  sourceDocument = {
    ...sourceDocument,
    title: article.title,
    raw_text: article.text,
    published_at: article.publishedAt || null,
    ...(commentary ? { commentary_mode: true, publication: "Deadline" } : {})
  };
```

Find the `analyzeArticle` call (~line 850):
```js
  const analysis = await analyzeArticle(
    sourceDocument,
    data,
    DEFAULT_ARTICLE_TARGET,
    mock
  );
```
Change to:
```js
  const analysis = await analyzeArticle(
    sourceDocument,
    data,
    DEFAULT_ARTICLE_TARGET,
    mock,
    commentary
  );
```

- [ ] **Step 6: Manual test**

Submit a test Deadline URL via `/article https://deadline.com/...` in Telegram. Confirm Telegram shows the summary with commentary-style angles. Submit the same URL again — confirm cap message. Submit a non-Deadline URL — confirm normal article behavior is unchanged.

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add scripts/lib/sources.js
git commit -m "feat: auto-detect deadline.com URLs and switch to commentary mode"
```

---

## Task 4: Photo bank infrastructure in queue.js

**Files:**
- Modify: `scripts/queue.js`
- Create: `pending/photo-bank.json`

- [ ] **Step 1: Create empty photo-bank.json**

Create `pending/photo-bank.json`:
```json
{
  "updated_at": null,
  "photos": []
}
```

- [ ] **Step 2: Add getPhotoBank and savePhotoBank to queue.js**

Find the end of `saveExperiments` function (around line 320). After it, add:

```js
export async function getPhotoBank(
  token,
  repo,
  targetPath = "pending/photo-bank.json"
) {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: { updated_at: null, photos: [] }
  });
  return { photoBank: data, sha };
}

export async function savePhotoBank(
  token,
  repo,
  photoBank,
  sha = null,
  targetPath = "pending/photo-bank.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: photoBank,
    sha,
    message: `chore(raw): update photo bank ${getTodayIso()}`
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add scripts/queue.js pending/photo-bank.json
git commit -m "feat: add photo bank persistence (getPhotoBank/savePhotoBank)"
```

---

## Task 5: Session commands and photo intake in telegram.js

**Files:**
- Modify: `api/telegram.js`

- [ ] **Step 1: Add getPhotoBank and savePhotoBank to imports**

Find the imports from `../scripts/queue.js` (around line 16-28):
```js
import {
  getCurrentPost,
  getQueue,
  getReviewMemory,
  getSourceDocuments,
  getSupplementalBank,
  saveQueue,
  saveReviewMemory,
  saveSourceDocuments,
  saveSupplementalBank,
  getExperiments,
  saveExperiments
} from "../scripts/queue.js";
```
Change to:
```js
import {
  getCurrentPost,
  getQueue,
  getReviewMemory,
  getSourceDocuments,
  getSupplementalBank,
  saveQueue,
  saveReviewMemory,
  saveSourceDocuments,
  saveSupplementalBank,
  getExperiments,
  saveExperiments,
  getPhotoBank,
  savePhotoBank
} from "../scripts/queue.js";
```

- [ ] **Step 2: Add photoBank case to persistContext**

Find `persistContext` function. After the `experiments` block (around line 636-644), before `await Promise.all(tasks)`, add:

```js
  if (fields.includes("photoBank")) {
    tasks.push(
      savePhotoBank(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_REPO,
        context.photoBank,
        context.photoBankSha
      )
    );
  }
```

- [ ] **Step 3: Load photoBank in the main handler**

Find the parallel load in `export default async function handler` (~line 1813):
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
Change to:
```js
    const [queueState, reviewMemoryState, sourceDocumentState, supplementalState, experimentsState, photoBankState, data] =
      await Promise.all([
        getQueue(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getReviewMemory(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSourceDocuments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSupplementalBank(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getExperiments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getPhotoBank(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        loadProjectData()
      ]);
```

- [ ] **Step 4: Add photoBank to context object**

Find the `const context = {` block (~line 1823):
```js
    const context = {
      data,
      queue: queueState.queue,
      queueSha: queueState.sha,
      reviewMemory: reviewMemoryState.reviewMemory,
      reviewMemorySha: reviewMemoryState.sha,
      sourceDocuments: sourceDocumentState.sourceDocuments,
      sourceDocumentsSha: sourceDocumentState.sha,
      supplementalBank: supplementalState.supplementalBank,
      supplementalBankSha: supplementalState.sha,
      experiments: experimentsState.experiments,
      experimentsSha: experimentsState.sha
    };
```
Change to:
```js
    const context = {
      data,
      queue: queueState.queue,
      queueSha: queueState.sha,
      reviewMemory: reviewMemoryState.reviewMemory,
      reviewMemorySha: reviewMemoryState.sha,
      sourceDocuments: sourceDocumentState.sourceDocuments,
      sourceDocumentsSha: sourceDocumentState.sha,
      supplementalBank: supplementalState.supplementalBank,
      supplementalBankSha: supplementalState.sha,
      experiments: experimentsState.experiments,
      experimentsSha: experimentsState.sha,
      photoBank: photoBankState.photoBank,
      photoBankSha: photoBankState.sha
    };
```

- [ ] **Step 5: Add /session command handler in handleTextMessage**

Find the `/sessions` handler (~line 792):
```js
  if (lower.startsWith("/sessions")) {
```
**Before** that block, insert the new `/session` handler:

```js
  if (lower.startsWith("/session") && !lower.startsWith("/sessions")) {
    const sub = lower.replace("/session", "").trim();

    if (sub === "start") {
      if (context.reviewMemory.active_session) {
        await sendMessage(chatId, `Session already active (started ${context.reviewMemory.active_session.started_at}). Send /session end first.`);
        return;
      }
      context.reviewMemory.active_session = {
        session_id: `session-${Date.now()}`,
        started_at: new Date().toISOString()
      };
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);
      await sendMessage(chatId, "Class session started. Any photo you send will be saved to the class bank automatically. Send /session end when done.");
      return;
    }

    if (sub === "end") {
      if (!context.reviewMemory.active_session) {
        await sendMessage(chatId, "No active session. Send /session start to begin.");
        return;
      }
      const sessionId = context.reviewMemory.active_session.session_id;
      const count = (context.photoBank?.photos || []).filter((p) => p.session_id === sessionId).length;
      delete context.reviewMemory.active_session;
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);
      await sendMessage(chatId, `Session ended. ${count} photo${count === 1 ? "" : "s"} saved to class bank.`);
      return;
    }

    // /session with no subcommand — status
    if (context.reviewMemory.active_session) {
      const { session_id, started_at } = context.reviewMemory.active_session;
      const count = (context.photoBank?.photos || []).filter((p) => p.session_id === session_id).length;
      await sendMessage(chatId, `Session active since ${started_at}.\n${count} photo${count === 1 ? "" : "s"} banked so far.\nSend /session end to close.`);
    } else {
      const total = (context.photoBank?.photos || []).filter((p) => p.quality_status === "usable").length;
      await sendMessage(chatId, `No active session. ${total} usable photo${total === 1 ? "" : "s"} in bank.\nSend /session start to begin.`);
    }
    return;
  }
```

- [ ] **Step 6: Add auto-bank case to handlePhotoMessage**

Find `async function handlePhotoMessage(update, context)` (~line 1149). The function starts:
```js
async function handlePhotoMessage(update, context) {
  const message = update.message;
  const chatId = message.chat.id;
  const awaiting = context.reviewMemory.awaiting_input;

  // ── CASE 1: awaiting a composed image re-roll ...
```
After the `const awaiting = ...` line, insert the session auto-bank case **before** all existing cases:

```js
  // ── SESSION CASE: active class session — auto-bank photo ──
  if (context.reviewMemory.active_session && !awaiting) {
    try {
      const buffer = await downloadTelegramFile(message.photo[message.photo.length - 1].file_id);
      const ts = Date.now();
      const dateStr = new Date().toISOString().slice(0, 10);
      const photoPath = `photos/class-live/${dateStr}/photo-${ts}.jpg`;
      await uploadBinaryToGitHub(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO, photoPath, buffer);

      const record = {
        id: `photo-${dateStr}-${ts}`,
        file_path: photoPath,
        session_id: context.reviewMemory.active_session.session_id,
        submitted_at: new Date().toISOString(),
        asset_type: "class_photo",
        consent_status: "internal_only",
        quality_status: "usable"
      };

      context.photoBank = context.photoBank || { updated_at: null, photos: [] };
      context.photoBank.photos = [...(context.photoBank.photos || []), record];
      context.photoBank.updated_at = new Date().toISOString();
      await persistContext(context, ["photoBank"]);

      const sessionCount = context.photoBank.photos.filter(
        (p) => p.session_id === context.reviewMemory.active_session.session_id
      ).length;
      await sendMessage(chatId, `Saved to class bank ✓ (${sessionCount} this session)`);
    } catch (err) {
      await sendMessage(chatId, `Failed to bank photo: ${err.message}`);
    }
    return;
  }
```

- [ ] **Step 7: Update /help text**

Find the `/help` handler (~line 726). Update the CONTENT SOURCES section:
```js
      "CONTENT SOURCES",
      "/class — ingest a class transcript or audio",
      "/article <url> — ingest an article (deadline.com → commentary mode)",
      "/session start|end — live class photo intake session",
      "/podcast <rss_url> [index] — ingest a podcast episode",
      "/source-status — source pipeline status",
```

- [ ] **Step 8: Manual test**

In Telegram:
1. Send `/session start` — confirm "Class session started" message
2. Send a photo — confirm "Saved to class bank ✓ (1 this session)"
3. Send another photo — confirm "(2 this session)"
4. Send `/session` — confirm status shows 2 photos
5. Send `/session end` — confirm "2 photos saved to class bank"
6. Check GitHub: `pending/photo-bank.json` should have 2 records, `photos/class-live/YYYY-MM-DD/` should have 2 JPG files

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add api/telegram.js
git commit -m "feat: add /session commands and live class photo auto-banking"
```

---

## Task 6: Renderer uses banked photos

**Files:**
- Modify: `scripts/lib/rendering.js`

- [ ] **Step 1: Load bank photo URLs in loadAssets**

Find `async function loadAssets()` (~line 63). The function currently builds `{ logoSrc, photoPaths }`. Change to also build `bankPhotoUrls`:

```js
async function loadAssets() {
  const assets = { logoSrc: "", photoPaths: [], bankPhotoUrls: [] };

  // Logo
  try {
    const buffer = await fs.readFile(path.join(ROOT_DIR, "raw_logo1.png"));
    assets.logoSrc = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    assets.logoSrc = "";
  }

  // Scan photos/ directory for local class photos (GitHub Actions env)
  try {
    const photosDir = path.join(ROOT_DIR, "photos");
    const entries = await fs.readdir(photosDir);
    assets.photoPaths = entries
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(photosDir, f));
  } catch {
    assets.photoPaths = [];
  }

  // Load banked class photos from photo-bank.json as GitHub raw URLs
  try {
    const bankPath = path.join(ROOT_DIR, "pending", "photo-bank.json");
    const bankData = JSON.parse(await fs.readFile(bankPath, "utf8"));
    const repo = process.env.GITHUB_REPO;
    if (repo) {
      assets.bankPhotoUrls = (bankData.photos || [])
        .filter((p) => p.quality_status === "usable")
        .map((p) => `https://raw.githubusercontent.com/${repo}/main/${p.file_path}`);
    }
  } catch {
    assets.bankPhotoUrls = [];
  }

  return assets;
}
```

- [ ] **Step 2: Prefer banked photos in resolvePostPhoto**

Find `resolvePostPhoto` (~line 88). The current fallback chain is: type-only → explicit URL → random local photo. Add banked photos between explicit URL and random local:

```js
async function resolvePostPhoto(post, sharedAssets) {
  // type-only layout: pure typography, no photo regardless of pool or photo_url
  if (post.layout_variant === "type-only") {
    return { photoUrl: "", photoBgSrc: "" };
  }

  // Explicit photo from post data (external URL) — template loads it directly
  const explicitUrl = post.media?.image_url || post.photo_url || post.attribution_photo_url || "";
  if (explicitUrl) return { photoUrl: explicitUrl, photoBgSrc: "" };

  // Prefer a banked class photo (GitHub raw URL) over random local file
  if (sharedAssets.bankPhotoUrls?.length) {
    const idx = Math.floor(Math.random() * sharedAssets.bankPhotoUrls.length);
    return { photoUrl: sharedAssets.bankPhotoUrls[idx], photoBgSrc: "" };
  }

  // Pick a random local class photo and encode it as base64
  if (sharedAssets.photoPaths?.length) {
    const idx = Math.floor(Math.random() * sharedAssets.photoPaths.length);
    const photoPath = sharedAssets.photoPaths[idx];
    try {
      const buffer = await fs.readFile(photoPath);
      const ext = path.extname(photoPath).slice(1).toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext;
      return { photoUrl: "", photoBgSrc: `data:image/${mime};base64,${buffer.toString("base64")}` };
    } catch {
      // fall through to no photo
    }
  }

  return { photoUrl: "", photoBgSrc: "" };
}
```

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add scripts/lib/rendering.js
git commit -m "feat: renderer prefers banked class photos from photo-bank.json"
```

---

## Task 7: Brand Training style reference in image-compose.js

**Files:**
- Modify: `scripts/lib/image-compose.js`
- Create: `photos/brand-ref/` (directory only — user populates)

- [ ] **Step 1: Create brand-ref directory**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
mkdir -p photos/brand-ref
echo "# Add 5-8 representative JPG/PNG files from Brand Training here" > photos/brand-ref/README.md
```

- [ ] **Step 2: Add ROOT_DIR and pickBrandRefPhoto to image-compose.js**

At the top of `scripts/lib/image-compose.js`, the current imports are:
```js
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
```
Add `fileURLToPath` import and `ROOT_DIR`:
```js
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
```

After `getOpenAI()` (around line 21), add `pickBrandRefPhoto`:

```js
async function pickBrandRefPhoto() {
  const brandRefDir = path.join(ROOT_DIR, "photos", "brand-ref");
  try {
    const files = await fs.readdir(brandRefDir);
    const images = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
    if (!images.length) return null;
    const chosen = images[Math.floor(Math.random() * images.length)];
    return await fs.readFile(path.join(brandRefDir, chosen));
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Use style ref as second image in composeImage**

Find `export async function composeImage({ imageBuffer, prompt })`. Replace the function body:

```js
export async function composeImage({ imageBuffer, prompt }) {
  const openai = await getOpenAI();

  const { toFile } = await import("openai");
  const imageFile = await toFile(imageBuffer, "photo.jpg", { type: "image/jpeg" });

  // Optionally attach a brand-ref photo as style anchor
  const styleRefBuffer = await pickBrandRefPhoto();
  let imageArg = imageFile;
  let promptWithRef = prompt;
  if (styleRefBuffer) {
    const styleRefFile = await toFile(styleRefBuffer, "style-ref.jpg", { type: "image/jpeg" });
    imageArg = [imageFile, styleRefFile];
    promptWithRef = `${prompt}\n\nThe second image is a RAW Actor Studio brand reference — use it to calibrate the visual tone and aesthetic only. Do not copy its composition or subject matter.`;
  }

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: imageArg,
    prompt: promptWithRef,
    n: 1,
    size: "1024x1024"
  });

  const imageData = response.data[0];

  if (imageData.b64_json) {
    return Buffer.from(imageData.b64_json, "base64");
  }

  if (imageData.url) {
    const res = await fetch(imageData.url);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error("gpt-image-1 returned no image data.");
}
```

- [ ] **Step 4: Copy brand reference images**

From `Brand Training/`, manually copy 5-8 strong representative images (class photos + example posts — JPG/PNG only, no HEIC, no MP4) into `photos/brand-ref/`. Good candidates:
- `Class posts.jpg.jpg`
- `Class posts - 5.jpg`
- `Class posts - 6.jpg`
- `Example 1.png`
- `example 2.png`
- `example 3.png`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git add scripts/lib/image-compose.js photos/brand-ref/
git commit -m "feat: attach brand-ref photo as style anchor in gpt-image-1 composition"
```

---

## Task 8: Push and verify deploy

- [ ] **Step 1: Pull and push**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
git stash  # stash any local-only files if needed
git pull --rebase origin main
git stash pop
git push origin main
```

- [ ] **Step 2: Confirm Vercel deploy**

```bash
cd "C:\Users\grish\Downloads\RAW Marketing Pipeline"
npx vercel ls --limit 3
```
Confirm a new "Ready" deployment appears within ~30 seconds.

- [ ] **Step 3: End-to-end smoke test in Telegram**

1. `/session start` → start session
2. Send a class photo → confirm auto-banked
3. `/session end` → confirm count
4. `/article https://deadline.com/...` → confirm commentary-mode summary in response
5. `/review` on a philosophy post → verify attribution photo appears if post has one
6. Trigger a render workflow → check a rendered post uses a banked photo

---

*Plan written 2026-04-14*
