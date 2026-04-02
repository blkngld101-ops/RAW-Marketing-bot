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
  saveSupplementalBank
} from "../scripts/queue.js";
import { processPodcastEpisode, fetchRssFeed, formatEpisodeList } from "../scripts/lib/podcast.js";
import { recordOutcome, buildScorecard } from "../scripts/lib/growth.js";
import { getExperiments, saveExperiments } from "../scripts/queue.js";

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
        { text: "Approve", callback_data: `apr:${key}` },
        { text: "Skip", callback_data: `skp:${key}` }
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
    await telegramApi("sendPhoto", {
      chat_id: chatId,
      photo: imageUrl,
      caption: `${post.headline}\n${post.date} | ${post.type}`.slice(0, 1024)
    });
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

async function pushToBuffer(post) {
  if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_PROFILE_IDS) {
    throw new Error("BUFFER_ACCESS_TOKEN and BUFFER_PROFILE_IDS are required.");
  }

  const profileId = process.env.BUFFER_PROFILE_IDS.split(",")
    .map((item) => item.trim())
    .find(Boolean);

  if (!profileId) {
    throw new Error("BUFFER_PROFILE_IDS is empty.");
  }

  const form = new URLSearchParams();
  form.append("access_token", process.env.BUFFER_ACCESS_TOKEN);
  form.append("profile_ids[]", profileId);
  form.append("text", `${post.caption}\n\n${(post.hashtags || []).join(" ")}`.trim());
  form.append("top", "false");
  form.append("shorten", "false");
  form.append("now", "false");

  const imageUrl = buildPublicImageUrl(post);
  if (imageUrl) {
    form.append("media[photo]", imageUrl);
  }

  const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Buffer create failed: ${response.status} ${text}`);
  }

  return response.json();
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
        `approved: ${counts.approved}`,
        `skipped: ${counts.skipped}`
      ].join("\n")
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

    const result = await processArticleSubmission(url, message, context);
    await sendMessage(chatId, summarizeSourceResult(result));
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
      "Class intake started. Send a transcript as text or send a voice note/audio file next."
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
      `Saved spotlight target for ${name}. Send one concrete quote or achievement line next.`
    );
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

async function handleCallback(update, context) {
  const callback = update.callback_query;
  const parts = String(callback.data || "").split(":");
  const action = parts[0];
  const detail = action === "rsn" ? parts[1] : null;
  const date = action === "rsn" ? parts[2] : parts[1];
  const angleId = action === "rsn" ? parts[3] : parts[2];
  const chatId = callback.message.chat.id;
  const post = findPost(context.queue, date, angleId);

  if (!post) {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Post not found."
    });
    return;
  }

  if (action === "apr") {
    const bufferResponse = await pushToBuffer(post);
    const approvedPost = {
      ...post,
      status: "approved",
      approved_at: new Date().toISOString(),
      buffer_update_id: bufferResponse?.updates?.[0]?.id || null
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
    context.reviewMemory.updated_at = new Date().toISOString();
    context.experiments = recordOutcome(context.experiments, post, "approved");
    await persistContext(context, ["queue", "reviewMemory", "experiments"]);
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Approved and pushed to Buffer."
    });
    await sendMessage(chatId, `Approved ${approvedPost.headline} and queued it in Buffer.`);
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
