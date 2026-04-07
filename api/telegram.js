import {
  getRecentContent,
  getTodayIso,
  loadProjectData,
  REVIEW_REASONS
} from "../scripts/lib/raw-core.js";
import {
  generatePostFromBrief,
  reviseExistingPost
} from "../scripts/lib/generation.js";
import {
  processArticleSource,
  processClassTranscriptSource,
  transcribeAudioBuffer
} from "../scripts/lib/sources.js";
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
import { processPodcastEpisode, fetchRssFeed, formatEpisodeList } from "../scripts/lib/podcast.js";
import { recordOutcome, buildScorecard } from "../scripts/lib/growth.js";
import { analyzePhoto, buildCompositionPrompt, runCompositionPipeline } from "../scripts/lib/image-compose.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESIGN_VARIANTS_PATH = join(__dirname, "../design-variants.json");

function loadDesignVariants() {
  try {
    return JSON.parse(readFileSync(DESIGN_VARIANTS_PATH, "utf8"));
  } catch {
    return { groups: [] };
  }
}

function getAllVariants(enabledOnly = true) {
  const config = loadDesignVariants();
  return config.groups.flatMap((g) =>
    g.variants
      .filter((v) => !enabledOnly || v.enabled)
      .map((v) => ({ ...v, groupId: g.id, groupLabel: g.label, groupEmoji: g.emoji }))
  );
}

function getVariantById(id) {
  return getAllVariants(false).find((v) => v.id === id) || null;
}

function getGroupById(id) {
  return loadDesignVariants().groups.find((g) => g.id === id) || null;
}

const REASON_CODES = {
  tg: "too generic",
  nrv: "not RAW voice",
  fi: "fact issue",
  ts: "too salesy",
  vft: "visual feels templated"
};

function json(res, status, payload) {
  res.status(status).json(payload);
}

function getChatId(update) {
  return (
    update.message?.chat?.id ||
    update.callback_query?.message?.chat?.id ||
    update.callback_query?.from?.id ||
    null
  );
}

function isAuthorizedChat(update) {
  const allowed = process.env.RAW_TELEGRAM_CHAT_ID;
  if (!allowed) {
    return true;
  }
  return String(getChatId(update)) === String(allowed);
}

async function telegramApi(method, payload) {
  const token = process.env.RAW_TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("RAW_TELEGRAM_BOT_TOKEN is missing.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

function buildPublicImageUrl(post) {
  if (post.photo_url) {
    return post.photo_url;
  }
  if (!post.image_path || !process.env.GITHUB_REPO) {
    return null;
  }
  return `https://raw.githubusercontent.com/${process.env.GITHUB_REPO}/main/${post.image_path}`;
}

function summarizePost(post) {
  const lines = [
    `${post.headline}`,
    `${post.date} | ${post.type} | ${post.status}`,
    `Origin: ${post.content_origin || "system"}`,
    `CTA: ${post.cta_type || "none"}`,
    post.image_body,
    "",
    post.caption
  ];

  if (post.hashtags?.length) {
    lines.push("", post.hashtags.join(" "));
  }

  if (post.proof_sources?.length) {
    lines.push("", `Proof: ${post.proof_sources.join(", ")}`);
  }

  if (post.source_document_id) {
    lines.push("", `Source document: ${post.source_document_id}`);
  }

  if (post.review_notes?.length) {
    lines.push(
      "",
      "Review notes:",
      ...post.review_notes.slice(-5).map((item) => `- ${item.note}`)
    );
  }

  return lines.filter(Boolean).join("\n");
}

function buildReviewKeyboard(post) {
  const key = `${post.date}:${post.angle_id}`;
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `apr:${key}` },
        { text: "⏭ Skip", callback_data: `skp:${key}` }
      ],
      [
        { text: "✏️ Caption", callback_data: `edt:cap:${key}` },
        { text: "# Hashtags", callback_data: `edt:htg:${key}` }
      ],
      [
        { text: "📝 Headline", callback_data: `edt:hdl:${key}` },
        { text: "🖼 Image Text", callback_data: `edt:bod:${key}` }
      ],
      [
        { text: "🎨 New Creative", callback_data: `edt:img:${key}` },
        { text: "🔀 Shuffle", callback_data: `shf:${key}` },
        { text: "🖼 Pick Design", callback_data: `dpk:${key}` }
      ],
      [
        { text: "Too Generic", callback_data: `rsn:tg:${key}` },
        { text: "Not RAW Voice", callback_data: `rsn:nrv:${key}` }
      ],
      [
        { text: "Fact Issue", callback_data: `rsn:fi:${key}` },
        { text: "Too Salesy", callback_data: `rsn:ts:${key}` }
      ],
      [{ text: "Visual Feels Templated", callback_data: `rsn:vft:${key}` }]
    ]
  };
}

function findPost(queue, date, angleId) {
  return (queue.posts || []).find(
    (post) => post.date === date && post.angle_id === angleId
  );
}

function replacePost(queue, updatedPost) {
  return {
    ...queue,
    posts: (queue.posts || []).map((post) =>
      post.date === updatedPost.date && post.angle_id === updatedPost.angle_id
        ? updatedPost
        : post
    )
  };
}

function countStatuses(queue) {
  const counts = {
    pending: 0,
    needs_revision: 0,
    publish_failed: 0,
    approved: 0,
    skipped: 0
  };

  for (const post of queue.posts || []) {
    if (counts[post.status] !== undefined) {
      counts[post.status] += 1;
    }
  }

  return counts;
}

function appendReviewNote(post, note, source = "telegram") {
  return {
    ...post,
    review_notes: [
      ...(post.review_notes || []),
      {
        source,
        note,
        recorded_at: new Date().toISOString()
      }
    ]
  };
}

async function sendReviewPost(chatId, post) {
  const keyboard = buildReviewKeyboard(post);
  const imageUrl = buildPublicImageUrl(post);

  if (imageUrl) {
    try {
      // Fetch image ourselves and upload as bytes — Telegram rejects raw.githubusercontent.com URLs directly
      const imgResponse = await fetch(imageUrl);
      if (imgResponse.ok) {
        const buffer = await imgResponse.arrayBuffer();
        const token = process.env.RAW_TELEGRAM_BOT_TOKEN;
        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append("photo", new Blob([buffer], { type: "image/png" }), "post.png");
        form.append("caption", `${post.headline}\n${post.date} | ${post.type}`.slice(0, 1024));
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          body: form
        });
      }
    } catch {
      // Photo failed — continue to text review message regardless
    }
  }

  await sendMessage(chatId, summarizePost(post), {
    reply_markup: keyboard
  });
}

async function triggerWorkflow() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO are required for /regenerate.");
  }

  const [owner, repo] = process.env.GITHUB_REPO.split("/");
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/raw-marketing-pipeline.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: "main"
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Workflow dispatch failed: ${response.status} ${text}`);
  }
}

async function postToInstagram(post) {
  if (!process.env.MAKE_WEBHOOK_URL) throw new Error("MAKE_WEBHOOK_URL is required.");

  const imageUrl = buildPublicImageUrl(post);
  if (!imageUrl) throw new Error("No image path on post — render first.");

  const caption = `${post.caption}\n\n${(post.hashtags || []).join(" ")}`.trim();

  const res = await fetch(process.env.MAKE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Make.com webhook failed: ${res.status} ${text}`);
  }

  return res.json();
}

function buildWixRichContent(articleText) {
  const paragraphs = String(articleText || "").split(/\n\n+/).filter(Boolean);
  return {
    nodes: paragraphs.map((text) => ({
      type: "PARAGRAPH",
      nodes: [{ type: "TEXT", textData: { text: text.trim(), decorations: [] } }],
      paragraphData: {}
    }))
  };
}

async function postToWixBlog(post) {
  if (!process.env.WIX_API_KEY || !process.env.WIX_SITE_ID) {
    throw new Error("WIX_API_KEY and WIX_SITE_ID are required.");
  }

  const res = await fetch("https://www.wixapis.com/blog/v3/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WIX_API_KEY}`,
      "wix-site-id": process.env.WIX_SITE_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      post: {
        title: post.blog_seo_title,
        excerpt: post.blog_meta_description || "",
        richContent: buildWixRichContent(post.blog_article),
        language: "en"
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wix Blog API failed: ${res.status} ${text}`);
  }

  return res.json();
}

function createEnrollmentBrief(data) {
  const preferredOffer =
    data.offersById.get("master-class") ||
    [...data.offersById.values()].find((offer) => offer.category === "class");

  return {
    angle_id: `manual-enrollment-${getTodayIso()}`,
    date: getTodayIso(),
    pillar: "conversion",
    weekday: null,
    type: "enrollment",
    label: preferredOffer?.name?.toUpperCase().slice(0, 28) || "UPCOMING OFFER",
    acting_concept: "repeatable process",
    acting_keywords: ["process", "scene", "audition", "clarity"],
    problem: preferredOffer?.positioning || "Actors need a process they can trust under pressure.",
    tool: "Lead with the specific craft result, not a vague promise.",
    cta_type: "enrollment",
    offer_id: preferredOffer?.id || null,
    cta_url: preferredOffer?.cta_url || "https://www.rawactorstudio.com/",
    audience_stage: "hot",
    proof_sources: ["repeatable-system", "industry-reality"],
    source_notes: [preferredOffer?.positioning || "RAW teaches with clarity."],
    offer_snapshot: preferredOffer || null,
    active_session: null,
    allow_location_copy: false
  };
}

function createSpotlightBrief(name, note, data) {
  return {
    angle_id: `manual-spotlight-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    date: getTodayIso(),
    pillar: "conversion",
    weekday: null,
    type: "spotlight",
    label: "STUDENT SPOTLIGHT",
    acting_concept: "proof of work",
    acting_keywords: ["actor", "work", "craft", "process"],
    problem: note,
    tool: "Use a concrete result or shift, not generic praise.",
    cta_type: "proof",
    offer_id: "master-class",
    cta_url: "https://www.rawactorstudio.com/adult-classes",
    audience_stage: "warm",
    proof_sources: ["testimonial-artist-seen", "serious-supportive"],
    source_notes: [note],
    offer_snapshot: data.offersById.get("master-class") || null,
    active_session: null,
    allow_location_copy: false
  };
}

function buildSourceStatusText(context) {
  const documents = context.sourceDocuments.documents || [];
  const items = context.supplementalBank.items || [];
  const docCounts = {
    processed: 0,
    rejected: 0,
    processing: 0
  };
  const itemCounts = {
    angle_only: 0,
    draft_ready: 0,
    promoted_to_queue: 0
  };

  for (const document of documents) {
    if (docCounts[document.processing_status] !== undefined) {
      docCounts[document.processing_status] += 1;
    }
  }

  for (const item of items) {
    if (itemCounts[item.draft_status] !== undefined) {
      itemCounts[item.draft_status] += 1;
    }
  }

  const latestDocs = documents.slice(0, 5).map((document) => {
    const summary = document.extracted_summary
      ? ` | ${document.extracted_summary.slice(0, 100)}`
      : "";
    return `- ${document.title} (${document.source_type}, ${document.processing_status})${summary}`;
  });

  return [
    "RAW source pipeline",
    `source docs: ${documents.length}`,
    `processed: ${docCounts.processed}`,
    `rejected: ${docCounts.rejected}`,
    `processing: ${docCounts.processing}`,
    `supplemental angles: ${items.length}`,
    `angle only: ${itemCounts.angle_only}`,
    `draft ready: ${itemCounts.draft_ready}`,
    `promoted to queue: ${itemCounts.promoted_to_queue}`,
    latestDocs.length ? "" : null,
    latestDocs.length ? "Latest sources:" : null,
    ...latestDocs
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeSourceResult(result) {
  const lines = [
    `Source saved: ${result.sourceDocument.title}`,
    `Type: ${result.sourceDocument.source_type}`,
    `Status: ${result.sourceDocument.processing_status}`,
    `Angles created: ${result.createdAngles}`,
    `Promoted to queue: ${result.promotedPosts.length}`
  ];

  if (result.sourceDocument.extracted_summary) {
    lines.push("", result.sourceDocument.extracted_summary);
  }

  if (result.promotedPosts.length) {
    lines.push("", "Promoted drafts:");
    lines.push(
      ...result.promotedPosts.map(
        (post) => `- ${post.date} | ${post.headline} (${post.content_origin})`
      )
    );
  }

  if (
    result.sourceDocument.processing_status === "rejected" &&
    result.sourceDocument.processing_notes?.length
  ) {
    lines.push("", `Rejected: ${result.sourceDocument.processing_notes[0]}`);
  }

  return lines.join("\n");
}

function extractArticleUrl(text) {
  const value = String(text || "").replace(/^\/article/i, "").trim();
  const match = value.match(/https?:\/\/\S+/i);
  return match ? match[0] : "";
}

function messageHasClassAudio(message) {
  return Boolean(
    message?.voice ||
      message?.audio ||
      (message?.document &&
        /^audio\//i.test(String(message.document.mime_type || "")))
  );
}

function getAudioDescriptor(message) {
  if (message.voice) {
    return {
      fileId: message.voice.file_id,
      fileName: `voice-note-${message.voice.file_unique_id || Date.now()}.ogg`,
      mimeType: "audio/ogg"
    };
  }

  if (message.audio) {
    return {
      fileId: message.audio.file_id,
      fileName: message.audio.file_name || `audio-${Date.now()}.mp3`,
      mimeType: message.audio.mime_type || "audio/mpeg"
    };
  }

  if (message.document && /^audio\//i.test(String(message.document.mime_type || ""))) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name || `audio-${Date.now()}`,
      mimeType: message.document.mime_type
    };
  }

  return null;
}

async function downloadTelegramFile(fileId) {
  const payload = await telegramApi("getFile", { file_id: fileId });
  const filePath = payload?.result?.file_path;
  if (!filePath) {
    throw new Error("Telegram did not return a file path.");
  }

  const token = process.env.RAW_TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function uploadBinaryToGitHub(token, repo, targetPath, buffer) {
  const [owner, name] = String(repo || "").split("/");
  const content = Buffer.from(buffer).toString("base64");
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${targetPath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `chore(raw): add creative photo ${targetPath}`,
        content
      })
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub photo upload failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function persistContext(context, fields = ["queue", "reviewMemory", "sourceDocuments", "supplementalBank"]) {
  const tasks = [];

  if (fields.includes("queue")) {
    tasks.push(
      saveQueue(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_REPO,
        context.queue,
        context.queueSha
      )
    );
  }

  if (fields.includes("reviewMemory")) {
    tasks.push(
      saveReviewMemory(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_REPO,
        context.reviewMemory,
        context.reviewMemorySha
      )
    );
  }

  if (fields.includes("sourceDocuments")) {
    tasks.push(
      saveSourceDocuments(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_REPO,
        context.sourceDocuments,
        context.sourceDocumentsSha
      )
    );
  }

  if (fields.includes("supplementalBank")) {
    tasks.push(
      saveSupplementalBank(
        process.env.GITHUB_TOKEN,
        process.env.GITHUB_REPO,
        context.supplementalBank,
        context.supplementalBankSha
      )
    );
  }

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

  await Promise.all(tasks);
}

async function processTranscriptSubmission(text, message, context, sourceType = "class_transcript") {
  const result = await processClassTranscriptSource({
    transcriptText: text,
    title: `RAW class ${getTodayIso()}`,
    submittedBy: message.from?.username || String(message.from?.id || "unknown"),
    sourceType,
    data: context.data,
    sourceDocuments: context.sourceDocuments,
    supplementalBank: context.supplementalBank,
    queue: context.queue,
    mock: !process.env.ANTHROPIC_API_KEY
  });

  context.sourceDocuments = result.sourceDocuments;
  context.supplementalBank = result.supplementalBank;
  context.queue = result.queue;
  delete context.reviewMemory.awaiting_input;
  context.reviewMemory.updated_at = new Date().toISOString();

  await persistContext(context);
  return result;
}

async function processArticleSubmission(url, message, context) {
  const result = await processArticleSource({
    sourceUrl: url,
    submittedBy: message.from?.username || String(message.from?.id || "unknown"),
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
  return result;
}

async function processAudioSubmission(message, context) {
  const descriptor = getAudioDescriptor(message);
  if (!descriptor) {
    throw new Error("No supported audio attachment was found.");
  }

  const buffer = await downloadTelegramFile(descriptor.fileId);
  const transcript = await transcribeAudioBuffer({
    buffer,
    fileName: descriptor.fileName,
    mimeType: descriptor.mimeType
  });

  return processTranscriptSubmission(transcript, message, context, "class_audio");
}

async function handleTextMessage(update, context) {
  const message = update.message;
  const text = String(message.text || "").trim();
  const chatId = message.chat.id;
  const lower = text.toLowerCase();

  if (lower.startsWith("/cancel")) {
    if (context.reviewMemory.awaiting_input) {
      delete context.reviewMemory.awaiting_input;
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);
      await sendMessage(chatId, "Cancelled.");
    } else {
      await sendMessage(chatId, "Nothing to cancel.");
    }
    return;
  }

  if (lower.startsWith("/help") || lower === "/commands") {
    await sendMessage(chatId, [
      "RAW Marketing Bot — commands",
      "",
      "REVIEW",
      "/review — show current post for review",
      "/status — queue counts",
      "/variants — list design variants (send /variants <id> to toggle on/off)",
      "",
      "GENERATE",
      "/regenerate — trigger content + render workflow",
      "/enrollment — generate an enrollment post now",
      "/spotlight <name> — start student spotlight flow",
      "",
      "CONTENT SOURCES",
      "/class — ingest a class transcript or audio",
      "/article <url> — ingest an article",
      "/podcast <rss_url> [index] — ingest a podcast episode",
      "/source-status — source pipeline status",
      "",
      "OTHER",
      "/sessions — list active sessions",
      "/scorecard — A/B design scorecard",
      "/cancel — cancel any pending input",
      "/help — this list"
    ].join("\n"));
    return;
  }

  if (lower.startsWith("/review")) {
    const current = getCurrentPost(context.queue);
    if (!current) {
      await sendMessage(chatId, "No pending review post is available right now.");
      return;
    }
    await sendReviewPost(chatId, current);
    return;
  }

  if (lower.startsWith("/status")) {
    const counts = countStatuses(context.queue);
    await sendMessage(
      chatId,
      [
        "RAW queue status",
        `pending: ${counts.pending}`,
        `needs revision: ${counts.needs_revision}`,
        counts.publish_failed ? `publish failed: ${counts.publish_failed}` : null,
        `approved: ${counts.approved}`,
        `skipped: ${counts.skipped}`
      ].filter(Boolean).join("\n")
    );
    return;
  }

  if (lower.startsWith("/source-status")) {
    await sendMessage(chatId, buildSourceStatusText(context));
    return;
  }

  if (lower.startsWith("/regenerate")) {
    await triggerWorkflow();
    await sendMessage(chatId, "GitHub Actions regenerate workflow triggered.");
    return;
  }

  if (lower.startsWith("/sessions")) {
    if (!context.data.sessions.length) {
      await sendMessage(chatId, "No verified sessions are currently stored in sessions.json.");
      return;
    }

    const lines = ["Verified sessions:"];
    for (const session of context.data.sessions) {
      lines.push(
        `${session.class_name || session.offer_id || "Session"} | ${session.start_date || "date TBD"} | ${session.urgency_stage || "awareness"}`
      );
    }
    await sendMessage(chatId, lines.join("\n"));
    return;
  }

  if (lower.startsWith("/enrollment")) {
    const brief = createEnrollmentBrief(context.data);
    const recentContent = getRecentContent(context.queue, context.reviewMemory, 12);
    const post = await generatePostFromBrief({
      brief,
      data: context.data,
      recentContent,
      mock: !process.env.ANTHROPIC_API_KEY
    });
    context.queue.posts.push(post);
    await persistContext(context, ["queue"]);
    await sendMessage(chatId, `Enrollment draft created.\n\n${summarizePost(post)}`);
    return;
  }

  if (lower.startsWith("/article")) {
    const url = extractArticleUrl(text);
    if (!url) {
      await sendMessage(chatId, "Use /article <url> with a full article link.");
      return;
    }

    try {
      const result = await processArticleSubmission(url, message, context);
      await sendMessage(chatId, summarizeSourceResult(result));
    } catch (articleError) {
      await sendMessage(chatId, `Could not process article: ${articleError.message}`);
    }
    return;
  }

  if (lower.startsWith("/class")) {
    const remainder = text.replace(/^\/class/i, "").trim();
    if (remainder) {
      const result = await processTranscriptSubmission(remainder, message, context);
      await sendMessage(chatId, summarizeSourceResult(result));
      return;
    }

    context.reviewMemory.awaiting_input = {
      mode: "class",
      chat_id: chatId,
      created_at: new Date().toISOString()
    };
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["reviewMemory"]);
    await sendMessage(
      chatId,
      "Class intake started. Send a transcript as text or send a voice note/audio file next.",
      { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cnl:" }]] } }
    );
    return;
  }

  if (lower.startsWith("/spotlight")) {
    const name = text.replace(/^\/spotlight/i, "").trim();
    if (!name) {
      await sendMessage(
        chatId,
        "Use /spotlight <name>, then send one concrete quote or achievement line."
      );
      return;
    }

    context.reviewMemory.awaiting_input = {
      mode: "spotlight",
      name,
      chat_id: chatId,
      created_at: new Date().toISOString()
    };
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["reviewMemory"]);
    await sendMessage(
      chatId,
      `Saved spotlight target for ${name}. Send one concrete quote or achievement line next.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cnl:" }]] } }
    );
    return;
  }

  if (lower.startsWith("/variants")) {
    const toggle = text.replace(/^\/variants\s*/i, "").trim();
    if (toggle) {
      // Toggle a specific variant on/off
      const config = loadDesignVariants();
      let found = false;
      for (const group of config.groups) {
        for (const variant of group.variants) {
          if (variant.id === toggle) {
            variant.enabled = !variant.enabled;
            found = true;
          }
        }
      }
      if (!found) {
        await sendMessage(chatId, `Variant "${toggle}" not found. Send /variants to see all IDs.`);
        return;
      }
      const { saveDesignVariants } = await import("../scripts/queue.js").catch(() => ({}));
      // Persist via GitHub
      const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
      if (GITHUB_TOKEN && GITHUB_REPO) {
        const [owner, repo] = GITHUB_REPO.split("/");
        const current = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/design-variants.json`, {
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }
        }).then((r) => r.json());
        await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/design-variants.json`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "chore(variants): toggle " + toggle,
            content: Buffer.from(JSON.stringify(config, null, 2) + "\n").toString("base64"),
            sha: current.sha
          })
        });
      }
      const state = config.groups.flatMap((g) => g.variants).find((v) => v.id === toggle);
      await sendMessage(chatId, `${toggle} is now ${state?.enabled ? "✅ enabled" : "❌ disabled"}.`);
      return;
    }

    // List all variants
    const config = loadDesignVariants();
    const lines = ["Design variants (send /variants <id> to toggle):"];
    for (const group of config.groups) {
      lines.push(`\n${group.emoji} ${group.label}`);
      for (const v of group.variants) {
        lines.push(`  ${v.enabled ? "✅" : "❌"} ${v.id} — ${v.label}`);
      }
    }
    await sendMessage(chatId, lines.join("\n"));
    return;
  }

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

    if (!parts[1]) {
      const episodes = await fetchRssFeed(rssUrl);
      const list = formatEpisodeList(episodes);
      await sendMessage(
        chatId,
        `Found ${episodes.length} episode(s). Ingesting episode 0 (latest):\n\n${list}\n\nTo pick a different episode next time: /podcast ${rssUrl} <index>`
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

  if (
    context.reviewMemory.awaiting_input?.mode === "class" &&
    String(context.reviewMemory.awaiting_input.chat_id) === String(chatId)
  ) {
    const result = await processTranscriptSubmission(text, message, context);
    await sendMessage(chatId, summarizeSourceResult(result));
    return;
  }

  if (
    context.reviewMemory.awaiting_input?.mode === "spotlight" &&
    String(context.reviewMemory.awaiting_input.chat_id) === String(chatId)
  ) {
    const brief = createSpotlightBrief(
      context.reviewMemory.awaiting_input.name,
      text,
      context.data
    );
    const recentContent = getRecentContent(context.queue, context.reviewMemory, 12);
    const post = await generatePostFromBrief({
      brief,
      data: context.data,
      recentContent,
      mock: !process.env.ANTHROPIC_API_KEY
    });
    context.queue.posts.push(post);
    delete context.reviewMemory.awaiting_input;
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["queue", "reviewMemory"]);
    await sendMessage(chatId, `Spotlight draft created.\n\n${summarizePost(post)}`);
    return;
  }

  if (
    context.reviewMemory.awaiting_input?.mode === "compose_prompt_edit" &&
    String(context.reviewMemory.awaiting_input.chat_id) === String(chatId)
  ) {
    // User sent their edited prompt — update and show before-generate keyboard
    context.reviewMemory.awaiting_input = {
      ...context.reviewMemory.awaiting_input,
      mode: "compose_prompt_before",
      draft_prompt: text
    };
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["reviewMemory"]);

    const variantId = context.reviewMemory.awaiting_input.variant_id;
    const variant = getVariantById(variantId);
    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Generate", callback_data: `cpx:gen:${context.reviewMemory.awaiting_input.post_date}:${context.reviewMemory.awaiting_input.post_angle_id}` },
          { text: "✏️ Edit again", callback_data: `cpx:edt:${context.reviewMemory.awaiting_input.post_date}:${context.reviewMemory.awaiting_input.post_angle_id}` }
        ]
      ]
    };
    await sendMessage(chatId, `Style: ${variant?.label || variantId}\n\nUpdated prompt:\n${text}`, { reply_markup: keyboard });
    return;
  }

  if (
    context.reviewMemory.awaiting_input?.mode === "edit_field" &&
    String(context.reviewMemory.awaiting_input.chat_id) === String(chatId)
  ) {
    const { field, date, angle_id } = context.reviewMemory.awaiting_input;

    if (field === "img") {
      await sendMessage(chatId, "Please send a photo, not text, to change the creative.");
      return;
    }

    const post = findPost(context.queue, date, angle_id);
    if (!post) {
      delete context.reviewMemory.awaiting_input;
      await sendMessage(chatId, "Could not find that post.");
      return;
    }

    let updatedPost;
    if (field === "cap") {
      updatedPost = { ...post, caption: text };
    } else if (field === "hdl") {
      updatedPost = { ...post, headline: text };
    } else if (field === "bod") {
      updatedPost = { ...post, image_body: text };
    } else if (field === "htg") {
      const hashtags = text
        .split(/[\s,\n]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
      updatedPost = { ...post, hashtags };
    } else {
      updatedPost = post;
    }

    context.queue = replacePost(context.queue, updatedPost);
    delete context.reviewMemory.awaiting_input;
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["queue", "reviewMemory"]);
    await sendMessage(chatId, `Updated.\n\n${summarizePost(updatedPost)}`);
    return;
  }

  const current = getCurrentPost(context.queue);
  if (!current) {
    await sendMessage(chatId, "No current review post to revise.");
    return;
  }

  const revised = await reviseExistingPost({
    post: current,
    feedback: text,
    data: context.data,
    recentContent: getRecentContent(context.queue, context.reviewMemory, 12),
    mock: !process.env.ANTHROPIC_API_KEY
  });
  const updated = {
    ...revised,
    review_notes: [
      ...(current.review_notes || []),
      ...(revised.review_notes || []),
      {
        source: "telegram",
        note: `Revision requested: ${text}`,
        recorded_at: new Date().toISOString()
      }
    ]
  };
  context.queue = replacePost(context.queue, updated);
  await persistContext(context, ["queue"]);
  await sendMessage(chatId, `Revision saved for ${updated.headline}.\n\n${summarizePost(updated)}`);
}

async function handleMediaMessage(update, context) {
  const message = update.message;
  const chatId = message.chat.id;

  if (
    context.reviewMemory.awaiting_input?.mode === "class" &&
    String(context.reviewMemory.awaiting_input.chat_id) === String(chatId)
  ) {
    if (!messageHasClassAudio(message)) {
      await sendMessage(chatId, "This attachment is not a supported audio file.");
      return;
    }

    const result = await processAudioSubmission(message, context);
    await sendMessage(chatId, summarizeSourceResult(result));
    return;
  }

  await sendMessage(chatId, "Use /class first, then send the voice note or audio file.");
}

async function handlePhotoMessage(update, context) {
  const message = update.message;
  const chatId = message.chat.id;
  const awaiting = context.reviewMemory.awaiting_input;

  // ── CASE 1: awaiting a composed image re-roll (user sent a photo mid-flow) ──
  // This shouldn't normally happen but handle gracefully by treating as new upload.

  // ── CASE 2: edit_field img (New Creative button) — save directly ──
  if (
    awaiting?.mode === "edit_field" &&
    awaiting.field === "img" &&
    String(awaiting.chat_id) === String(chatId)
  ) {
    const post = findPost(context.queue, awaiting.date, awaiting.angle_id) || getCurrentPost(context.queue);
    if (!post) {
      await sendMessage(chatId, "No post found. Use /review to load one.");
      return;
    }
    try {
      const buffer = await downloadTelegramFile(message.photo[message.photo.length - 1].file_id);
      const photoPath = `photos/creative-${post.date}-${post.angle_id}-${Date.now()}.jpg`;
      await uploadBinaryToGitHub(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO, photoPath, buffer);
      const rawUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPO}/main/${photoPath}`;
      const updated = { ...post, photo_url: rawUrl, image_path: null };
      context.queue = replacePost(context.queue, updated);
      delete context.reviewMemory.awaiting_input;
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["queue", "reviewMemory"]);
      try {
        await triggerWorkflow();
        await sendMessage(chatId, `Creative updated for "${post.headline}". Re-rendering — send /review in a minute.`);
      } catch {
        await sendMessage(chatId, `Creative saved for "${post.headline}". Use /regenerate to re-render.`);
      }
    } catch (err) {
      await sendMessage(chatId, `Failed to save photo: ${err.message}`);
    }
    return;
  }

  // ── CASE 3: new actor/class photo upload — show options ──
  const post = getCurrentPost(context.queue);
  if (!post) {
    await sendMessage(chatId, "No post is currently under review. Use /review first.");
    return;
  }

  try {
    const buffer = await downloadTelegramFile(message.photo[message.photo.length - 1].file_id);

    // Stash the raw photo buffer as a temp GitHub upload so we can reference it later
    const tempPath = `photos/tmp-${Date.now()}.jpg`;
    await uploadBinaryToGitHub(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO, tempPath, buffer);
    const tempUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPO}/main/${tempPath}`;

    // Save state so we can retrieve the photo in follow-up callbacks
    context.reviewMemory.awaiting_input = {
      mode: "photo_options",
      post_date: post.date,
      post_angle_id: post.angle_id,
      temp_photo_url: tempUrl,
      chat_id: chatId,
      created_at: new Date().toISOString()
    };
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["reviewMemory"]);

    const key = `${post.date}:${post.angle_id}`;
    const keyboard = {
      inline_keyboard: [
        [{ text: "✅ Use as background (current behaviour)", callback_data: `cph:bg:${key}` }],
        [{ text: "🤖 AI Compose — Cutout style", callback_data: `cph:cutout:${key}` }],
        [{ text: "🎞 AI Compose — Scene style", callback_data: `cph:scene:${key}` }]
      ]
    };
    await sendMessage(chatId, `Got it. What would you like to do with this photo for "${post.headline}"?`, { reply_markup: keyboard });
  } catch (err) {
    await sendMessage(chatId, `Failed to process photo: ${err.message}`);
  }
}

async function handleCallback(update, context) {
  const callback = update.callback_query;
  const parts = String(callback.data || "").split(":");
  const action = parts[0];
  // Actions where parts[1] is a detail code and parts[2..3] are date:angleId
  const DETAIL_ACTIONS = new Set(["rsn", "edt", "dpg", "dps", "cph", "cpg", "cpv", "cpx"]);
  const hasDetail = DETAIL_ACTIONS.has(action);
  const detail = hasDetail ? parts[1] : null;
  // cpg has an extra segment: cpg:mode:groupId:date:angleId
  const dateOffset = action === "cpg" ? 3 : (hasDetail ? 2 : 1);
  const angleOffset = action === "cpg" ? 4 : (hasDetail ? 3 : 2);
  const date = parts[dateOffset];
  const angleId = parts[angleOffset];
  const chatId = callback.message.chat.id;

  // Cancel — clears awaiting_input regardless of post state
  if (action === "cnl") {
    if (context.reviewMemory.awaiting_input) {
      delete context.reviewMemory.awaiting_input;
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);
    }
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Cancelled." });
    await sendMessage(chatId, "Cancelled. Send /review to continue.");
    return;
  }

  const post = findPost(context.queue, date, angleId);

  if (!post) {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Post not found."
    });
    return;
  }

  if (action === "apr") {
    const hasBlog = Boolean(post.blog_article && post.blog_seo_title);
    const [igResult, blogResult] = await Promise.allSettled([
      postToInstagram(post),
      hasBlog ? postToWixBlog(post) : Promise.resolve(null)
    ]);

    const igOk = igResult.status === "fulfilled";
    const blogOk = !hasBlog || blogResult.status === "fulfilled";
    const igErr = igResult.reason?.message || "";
    const blogErr = blogResult.reason?.message || "";

    const now = new Date().toISOString();
    const statusParts = [`Instagram: ${igOk ? "posted" : "failed — " + igErr}`];
    if (hasBlog) statusParts.push(`Wix blog: ${blogOk ? "draft created" : "failed — " + blogErr}`);

    if (!igOk) {
      const failedPost = {
        ...post,
        status: "publish_failed",
        publish_failed_at: now,
        publish_error: igErr || "unknown error",
        instagram_post_id: null,
        wix_draft_id: null
      };
      context.queue = replacePost(context.queue, failedPost);
      context.reviewMemory.review_log = [
        ...(context.reviewMemory.review_log || []),
        {
          type: "publish_failed",
          date: failedPost.date,
          angle_id: failedPost.angle_id,
          error: igErr || "unknown error",
          recorded_at: now
        }
      ].slice(-200);
      context.reviewMemory.updated_at = now;
      await persistContext(context, ["queue", "reviewMemory"]);
      await telegramApi("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Publish failed — post kept in queue for retry."
      });
      await sendMessage(chatId, `Publish failed for: ${post.headline}\n${statusParts.join(" | ")}\n\nPost is still in the review queue.`);
      return;
    }

    const approvedPost = {
      ...post,
      status: "approved",
      approved_at: now,
      instagram_post_id: igResult.value?.id || null,
      wix_draft_id: (hasBlog && blogOk) ? (blogResult.value?.post?.id || null) : null
    };
    context.queue = replacePost(context.queue, approvedPost);
    context.reviewMemory.approved_exemplars = [
      ...(context.reviewMemory.approved_exemplars || []),
      {
        date: approvedPost.date,
        angle_id: approvedPost.angle_id,
        type: approvedPost.type,
        headline: approvedPost.headline,
        caption: approvedPost.caption,
        proof_sources: approvedPost.proof_sources,
        approved_at: approvedPost.approved_at
      }
    ].slice(-40);
    context.reviewMemory.review_log = [
      ...(context.reviewMemory.review_log || []),
      {
        type: "approved",
        date: approvedPost.date,
        angle_id: approvedPost.angle_id,
        recorded_at: approvedPost.approved_at
      }
    ].slice(-200);
    context.reviewMemory.updated_at = now;
    context.experiments = recordOutcome(context.experiments, post, "approved");
    await persistContext(context, ["queue", "reviewMemory", "experiments"]);

    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Approved and posted."
    });
    await sendMessage(chatId, `${approvedPost.headline}\n${statusParts.join(" | ")}`);
    return;
  }

  if (action === "skp") {
    const skipped = {
      ...post,
      status: "skipped",
      skipped_at: new Date().toISOString()
    };
    context.queue = replacePost(context.queue, skipped);
    await persistContext(context, ["queue"]);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Skipped."
    });
    return;
  }

  if (action === "edt") {
    const field = detail;
    const fieldLabels = { cap: "caption", htg: "hashtags", hdl: "headline", bod: "image text", img: "creative photo" };
    const fieldLabel = fieldLabels[field] || field;

    context.reviewMemory.awaiting_input = {
      mode: "edit_field",
      field,
      date: post.date,
      angle_id: post.angle_id,
      chat_id: chatId,
      created_at: new Date().toISOString()
    };
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["reviewMemory"]);

    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Send the new ${fieldLabel}.`
    });

    const prompt = field === "img"
      ? "Send a photo to use as the new background creative."
      : field === "htg"
      ? "Send the new hashtags (space or newline separated, with or without #):"
      : `Send the new ${fieldLabel}:`;

    await sendMessage(chatId, prompt, {
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `cnl:${key}` }]] }
    });
    return;
  }

  if (action === "shf") {
    const enabledVariants = getAllVariants(true);
    if (!enabledVariants.length) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "No enabled variants found." });
      return;
    }
    const current = post.design_variant || null;
    const options = enabledVariants.filter((v) => v.id !== current);
    const pick = options.length ? options[Math.floor(Math.random() * options.length)] : enabledVariants[0];
    const shuffled = {
      ...post,
      design_variant: pick.id,
      layout_variant: pick.layout_variant,
      image_path: null,
      rendered_at: null
    };
    context.queue = replacePost(context.queue, shuffled);
    await persistContext(context, ["queue"]);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Shuffled → ${pick.groupEmoji} ${pick.label}`
    });
    try {
      await triggerWorkflow();
      await sendMessage(chatId, `Design shuffled to ${pick.groupEmoji} ${pick.label} for "${post.headline}". Re-rendering — /review in a minute.`);
    } catch {
      await sendMessage(chatId, `Design set to ${pick.groupEmoji} ${pick.label} for "${post.headline}". Use /regenerate to re-render.`);
    }
    return;
  }

  // ── COMPOSE PHOTO FLOW ──────────────────────────────────────────────────────

  if (action === "cph") {
    // cph : mode(bg|cutout|scene) : date : angleId
    const mode = detail;
    const awaiting = context.reviewMemory.awaiting_input;
    if (awaiting?.mode !== "photo_options" || String(awaiting.chat_id) !== String(chatId)) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Session expired. Please upload the photo again." });
      return;
    }

    const tempUrl = awaiting.temp_photo_url;

    if (mode === "bg") {
      // Use as background directly — same as old behaviour
      const updated = { ...post, photo_url: tempUrl, image_path: null };
      context.queue = replacePost(context.queue, updated);
      delete context.reviewMemory.awaiting_input;
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["queue", "reviewMemory"]);
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Saved as background." });
      try {
        await triggerWorkflow();
        await sendMessage(chatId, `Photo set as background for "${post.headline}". Re-rendering — /review in a minute.`);
      } catch {
        await sendMessage(chatId, `Photo saved. Use /regenerate to re-render.`);
      }
      return;
    }

    // AI compose — show style group picker filtered to relevant groups
    const relevantGroups = mode === "cutout"
      ? ["cutout-poster", "bold-editorial", "experimental"]
      : ["scene-portrait", "bold-editorial", "experimental"];

    const config = loadDesignVariants();
    const groups = config.groups.filter((g) => relevantGroups.includes(g.id) && g.variants.some((v) => v.enabled));
    const keyboard = {
      inline_keyboard: [
        ...groups.map((g) => [
          { text: `${g.emoji} ${g.label}`, callback_data: `cpg:${mode}:${g.id}:${date}:${angleId}` }
        ])
      ]
    };
    context.reviewMemory.awaiting_input = { ...awaiting, compose_mode: mode };
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["reviewMemory"]);
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Pick a style group." });
    await sendMessage(chatId, "Choose a style direction:", { reply_markup: keyboard });
    return;
  }

  if (action === "cpg") {
    // cpg : mode : groupId : date : angleId
    const mode = detail;    // parts[1]
    const groupId = parts[2]; // parts[2]
    const group = getGroupById(groupId);
    const awaiting = context.reviewMemory.awaiting_input;

    if (!group || awaiting?.mode !== "photo_options") {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Session expired." });
      return;
    }

    const enabled = group.variants.filter((v) => v.enabled);
    const rows = [];
    for (let i = 0; i < enabled.length; i += 2) {
      rows.push(
        enabled.slice(i, i + 2).map((v) => ({
          text: v.label,
          callback_data: `cpv:${v.id}:${date}:${angleId}`
        }))
      );
    }
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: group.label });
    await sendMessage(chatId, `${group.emoji} ${group.label} — pick a theme:`, { reply_markup: { inline_keyboard: rows } });
    return;
  }

  if (action === "cpv") {
    // cpv : variantId : date : angleId — build prompt and show BEFORE generation
    const variantId = detail;
    const awaiting = context.reviewMemory.awaiting_input;
    if (awaiting?.mode !== "photo_options" || String(awaiting.chat_id) !== String(chatId)) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Session expired." });
      return;
    }

    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Analysing photo…" });
    await sendMessage(chatId, "Analysing your photo…");

    try {
      const imgRes = await fetch(awaiting.temp_photo_url);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const analysis = await analyzePhoto(buffer);
      const prompt = buildCompositionPrompt({ variantId, analysis });

      const variant = getVariantById(variantId);
      // Save state for before-prompt editing
      context.reviewMemory.awaiting_input = {
        ...awaiting,
        mode: "compose_prompt_before",
        variant_id: variantId,
        draft_prompt: prompt,
        analysis,
        post_date: date,
        post_angle_id: angleId
      };
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Generate", callback_data: `cpx:gen:${date}:${angleId}` },
            { text: "✏️ Edit prompt", callback_data: `cpx:edt:${date}:${angleId}` }
          ],
          [{ text: "🎨 Change style", callback_data: `cph:${awaiting.compose_mode || "scene"}:${date}:${angleId}` }]
        ]
      };

      await sendMessage(
        chatId,
        `Style: ${variant?.label || variantId}\n\nDraft prompt:\n${prompt}`,
        { reply_markup: keyboard }
      );
    } catch (err) {
      await sendMessage(chatId, `Could not analyse photo: ${err.message}`);
    }
    return;
  }

  if (action === "cpx") {
    // cpx : gen|edt : date : angleId
    const subAction = detail;
    const awaiting = context.reviewMemory.awaiting_input;
    if (!["compose_prompt_before", "compose_prompt_after"].includes(awaiting?.mode) ||
        String(awaiting.chat_id) !== String(chatId)) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Session expired." });
      return;
    }

    if (subAction === "edt") {
      // Ask user to send their edited prompt
      context.reviewMemory.awaiting_input = { ...awaiting, mode: "compose_prompt_edit" };
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Send your edited prompt." });
      await sendMessage(chatId, `Current prompt:\n\n${awaiting.draft_prompt}\n\nReply with your edited version:`);
      return;
    }

    // Generate
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Composing image…" });
    await sendMessage(chatId, "Composing image with AI — this takes about 15 seconds…");

    try {
      const imgRes = await fetch(awaiting.temp_photo_url);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const { composedBuffer } = await runCompositionPipeline({
        imageBuffer: buffer,
        variantId: awaiting.variant_id,
        userPromptOverride: awaiting.draft_prompt
      });

      // Upload composed image to GitHub
      const composedPath = `photos/composed-${post.date}-${post.angle_id}-${Date.now()}.png`;
      await uploadBinaryToGitHub(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO, composedPath, composedBuffer);
      const composedUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPO}/main/${composedPath}`;

      // Save state for after-prompt review
      context.reviewMemory.awaiting_input = {
        ...awaiting,
        mode: "compose_prompt_after",
        composed_url: composedUrl
      };
      context.reviewMemory.updated_at = new Date().toISOString();
      await persistContext(context, ["reviewMemory"]);

      // Send the composed image
      const token = process.env.RAW_TELEGRAM_BOT_TOKEN;
      const imgFetch = await fetch(composedUrl);
      if (imgFetch.ok) {
        const imgBuf = await imgFetch.arrayBuffer();
        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append("photo", new Blob([imgBuf], { type: "image/png" }), "composed.png");
        form.append("caption", `Composed: ${getVariantById(awaiting.variant_id)?.label || awaiting.variant_id}`);
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Use this", callback_data: `cpu:${date}:${angleId}` },
            { text: "🔄 Re-roll", callback_data: `cpx:gen:${date}:${angleId}` }
          ],
          [
            { text: "✏️ Tweak prompt", callback_data: `cpx:edt:${date}:${angleId}` },
            { text: "🎨 New style", callback_data: `cph:${awaiting.compose_mode || "scene"}:${date}:${angleId}` }
          ]
        ]
      };

      await sendMessage(
        chatId,
        `Prompt used:\n${awaiting.draft_prompt}`,
        { reply_markup: keyboard }
      );
    } catch (err) {
      await sendMessage(chatId, `Composition failed: ${err.message}`);
    }
    return;
  }

  if (action === "cpu") {
    // cpu : date : angleId — use the composed image
    const awaiting = context.reviewMemory.awaiting_input;
    if (awaiting?.mode !== "compose_prompt_after" || String(awaiting.chat_id) !== String(chatId)) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Session expired." });
      return;
    }

    const variant = getVariantById(awaiting.variant_id);
    const updated = {
      ...post,
      photo_url: awaiting.composed_url,
      design_variant: awaiting.variant_id,
      layout_variant: variant?.layout_variant || post.layout_variant,
      composition_prompt: awaiting.draft_prompt,
      image_path: null,
      rendered_at: null
    };
    context.queue = replacePost(context.queue, updated);
    delete context.reviewMemory.awaiting_input;
    context.reviewMemory.updated_at = new Date().toISOString();
    await persistContext(context, ["queue", "reviewMemory"]);
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Saved. Re-rendering…" });
    try {
      await triggerWorkflow();
      await sendMessage(chatId, `Composition saved for "${post.headline}". Re-rendering with brand layer — /review in a minute.`);
    } catch {
      await sendMessage(chatId, `Composition saved. Use /regenerate to add the brand layer.`);
    }
    return;
  }

  if (action === "dpk") {
    // Design pick — show group selector
    const groups = loadDesignVariants().groups.filter((g) =>
      g.variants.some((v) => v.enabled)
    );
    const keyboard = {
      inline_keyboard: [
        ...groups.map((g) => [
          { text: `${g.emoji} ${g.label}`, callback_data: `dpg:${g.id}:${date}:${angleId}` }
        ]),
        [{ text: "🔀 Surprise me", callback_data: `shf:${date}:${angleId}` }]
      ]
    };
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Choose a style group." });
    await sendMessage(chatId, "Pick a design style:", { reply_markup: keyboard });
    return;
  }

  if (action === "dpg") {
    // Design pick group — show variants within group
    // parts: dpg : groupId : date : angleId
    const groupId = detail;
    const group = getGroupById(groupId);
    if (!group) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Group not found." });
      return;
    }
    const enabled = group.variants.filter((v) => v.enabled);
    const rows = [];
    for (let i = 0; i < enabled.length; i += 2) {
      rows.push(
        enabled.slice(i, i + 2).map((v) => ({
          text: v.label,
          callback_data: `dps:${v.id}:${date}:${angleId}`
        }))
      );
    }
    rows.push([{ text: "← Back", callback_data: `dpk:${date}:${angleId}` }]);
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: group.label });
    await sendMessage(chatId, `${group.emoji} ${group.label} — pick a theme:`, { reply_markup: { inline_keyboard: rows } });
    return;
  }

  if (action === "dps") {
    // Design pick specific variant — apply it
    const variantId = detail;
    const variant = getVariantById(variantId);
    if (!variant) {
      await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: "Variant not found." });
      return;
    }
    const updated = {
      ...post,
      design_variant: variantId,
      layout_variant: variant.layout_variant,
      image_path: null,
      rendered_at: null
    };
    context.queue = replacePost(context.queue, updated);
    await persistContext(context, ["queue"]);
    await telegramApi("answerCallbackQuery", { callback_query_id: callback.id, text: `Design set: ${variant.label}` });
    try {
      await triggerWorkflow();
      await sendMessage(chatId, `Design set to "${variant.label}" for "${post.headline}". Re-rendering — send /review in a minute.`);
    } catch {
      await sendMessage(chatId, `Design set to "${variant.label}". Use /regenerate to re-render.`);
    }
    return;
  }

  if (action === "rsn") {
    const reason = REASON_CODES[detail] || detail;
    if (!REVIEW_REASONS.includes(reason)) {
      await telegramApi("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Unknown reason."
      });
      return;
    }

    const updated = appendReviewNote(
      {
        ...post,
        status: "needs_revision"
      },
      reason
    );
    context.queue = replacePost(context.queue, updated);
    context.reviewMemory.rejected_patterns = [
      ...(context.reviewMemory.rejected_patterns || []),
      {
        date: post.date,
        angle_id: post.angle_id,
        reason,
        headline: post.headline,
        recorded_at: new Date().toISOString()
      }
    ].slice(-100);
    context.reviewMemory.review_log = [
      ...(context.reviewMemory.review_log || []),
      {
        type: "revision_request",
        date: post.date,
        angle_id: post.angle_id,
        reason,
        recorded_at: new Date().toISOString()
      }
    ].slice(-200);
    context.reviewMemory.updated_at = new Date().toISOString();
    context.experiments = recordOutcome(context.experiments, post, "rejected", reason);
    await persistContext(context, ["queue", "reviewMemory", "experiments"]);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: `Saved: ${reason}`
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 200, { ok: true, method: req.method });
  }

  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    if (!isAuthorizedChat(update)) {
      return json(res, 200, { ok: true, ignored: "unauthorized_chat" });
    }

    const [queueState, reviewMemoryState, sourceDocumentState, supplementalState, experimentsState, data] =
      await Promise.all([
        getQueue(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getReviewMemory(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSourceDocuments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getSupplementalBank(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        getExperiments(process.env.GITHUB_TOKEN, process.env.GITHUB_REPO),
        loadProjectData()
      ]);

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

    if (update.message?.text) {
      await handleTextMessage(update, context);
    } else if (update.message && messageHasClassAudio(update.message)) {
      await handleMediaMessage(update, context);
    } else if (update.message?.photo) {
      await handlePhotoMessage(update, context);
    } else if (update.callback_query?.data) {
      await handleCallback(update, context);
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      ok: false,
      error: error.message
    });
  }
}
