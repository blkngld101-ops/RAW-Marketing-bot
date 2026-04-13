import crypto from "node:crypto";

import {
  allocateDatesForPillars,
  createId,
  dedupeHashtags,
  firstSentence,
  getTodayIso,
  normalizeText,
  uniqueBy,
  wordCount
} from "./raw-core.js";
import { generatePostFromBrief } from "./generation.js";

const DEFAULT_TRANSCRIPT_TARGET = Number(process.env.RAW_TRANSCRIPT_ANGLE_TARGET || 12);
const DEFAULT_ARTICLE_TARGET = Number(process.env.RAW_ARTICLE_ANGLE_TARGET || 4);
const DEFAULT_TRANSCRIPT_PROMOTE = Number(
  process.env.RAW_TRANSCRIPT_PROMOTE_COUNT || 3
);
const DEFAULT_ARTICLE_PROMOTE = Number(process.env.RAW_ARTICLE_PROMOTE_COUNT || 2);
const DEFAULT_ARTICLE_MAX_AGE_DAYS = Number(process.env.RAW_ARTICLE_MAX_AGE_DAYS || 10);

const TEMPLATE_BY_PILLAR = {
  craft: "craft-tip",
  philosophy: "philosophy",
  conversion: "behind-the-scenes"
};

const CTA_URL_BY_TYPE = {
  audit: "free-audit",
  enrollment: "master-class",
  reels: "raw-reels"
};

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function clipText(value, maxLength = 18000) {
  return String(value || "").trim().slice(0, maxLength);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "));
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }

  throw new Error("Structured model response did not contain JSON.");
}

async function callAnthropicJson({ system, prompt, maxTokens = 2500 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required.");
  }

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  return JSON.parse(extractJson(text));
}

function getSubmittedBy(message) {
  const user = message?.from || {};
  return (
    user.username ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    String(user.id || "unknown")
  );
}

function buildSourceDocument({
  sourceType,
  title,
  rawText,
  transcriptText = "",
  sourceUrl = null,
  submittedBy,
  processingStatus = "processing"
}) {
  const body = transcriptText || rawText || sourceUrl || title;
  return {
    id: createId("src"),
    source_type: sourceType,
    ingestion_channel: "telegram",
    title,
    source_url: sourceUrl,
    raw_text: clipText(rawText, 30000),
    transcript_text: clipText(transcriptText, 30000),
    submitted_at: new Date().toISOString(),
    submitted_by: submittedBy,
    tags: [],
    processing_status: processingStatus,
    extracted_summary: "",
    content_hash: hashText(body),
    processing_notes: []
  };
}

function addSourceDocument(store, document) {
  return {
    updated_at: new Date().toISOString(),
    documents: [document, ...(store.documents || [])]
  };
}

function updateSourceDocument(store, updatedDocument) {
  return {
    updated_at: new Date().toISOString(),
    documents: (store.documents || []).map((document) =>
      document.id === updatedDocument.id ? updatedDocument : document
    )
  };
}

function addSupplementalItems(store, items) {
  return {
    updated_at: new Date().toISOString(),
    items: [...(store.items || []), ...items]
  };
}

function updateSupplementalItems(store, items) {
  const nextById = new Map(items.map((item) => [item.id, item]));
  return {
    updated_at: new Date().toISOString(),
    items: (store.items || []).map((item) => nextById.get(item.id) || item)
  };
}

function extractParagraphsFromHtml(html) {
  const matches = [...String(html || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  return matches
    .map((match) => cleanText(stripTags(match[1])))
    .filter((paragraph) => paragraph.length > 40);
}

function extractMetaContent(html, patterns) {
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match?.[1]) {
      return cleanText(decodeHtmlEntities(match[1]));
    }
  }
  return "";
}

function extractArticleData(html, sourceUrl) {
  const title =
    extractMetaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"]+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]) || sourceUrl;
  const publishedAt =
    extractMetaContent(html, [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"]+)["']/i,
      /<meta[^>]+name=["']article:published_time["'][^>]+content=["']([^"]+)["']/i,
      /<time[^>]+datetime=["']([^"]+)["']/i
    ]) || null;
  const paragraphs = extractParagraphsFromHtml(html);
  const text = clipText(paragraphs.join("\n\n"), 24000);

  return {
    title,
    publishedAt,
    text,
    paragraphCount: paragraphs.length
  };
}

function ageInDays(isoDate) {
  if (!isoDate) {
    return null;
  }
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function parseFreshnessWindow(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function headlineFromHook(hook) {
  return String(hook || "")
    .replace(/[.?!].*$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(" ");
}

function angleLabel(angleType, pillar) {
  return String(angleType || pillar || "RAW")
    .replace(/[_-]+/g, " ")
    .toUpperCase()
    .slice(0, 28);
}

function normalizeAngleItem(rawAngle, sourceDocument, index) {
  return {
    id: createId("sup"),
    source_document_id: sourceDocument.id,
    content_origin:
      sourceDocument.source_type === "industry_article" ? "article" : "transcript",
    pillar: ["craft", "philosophy", "conversion"].includes(rawAngle.pillar)
      ? rawAngle.pillar
      : "craft",
    angle_type: rawAngle.angle_type || "lesson",
    hook: cleanText(rawAngle.hook || rawAngle.title || `Angle ${index + 1}`),
    actor_relevance: cleanText(rawAngle.actor_relevance || ""),
    proof_notes: (rawAngle.proof_notes || []).map((note) => cleanText(note)).filter(Boolean),
    suggested_template_family:
      rawAngle.suggested_template_family || TEMPLATE_BY_PILLAR[rawAngle.pillar] || "craft-tip",
    score: Math.max(0, Math.min(100, Number(rawAngle.score || 0))),
    draft_status: "angle_only",
    acting_concept: cleanText(rawAngle.acting_concept || ""),
    problem: cleanText(rawAngle.problem || rawAngle.actor_relevance || rawAngle.hook),
    tool: cleanText(rawAngle.tool || rawAngle.hook),
    cta_type: rawAngle.cta_type || "soft",
    audience_stage: rawAngle.audience_stage || "warm",
    keywords: (rawAngle.keywords || [])
      .map((keyword) => cleanText(keyword))
      .filter(Boolean)
      .slice(0, 8),
    source_excerpt: cleanText(rawAngle.source_excerpt || ""),
    freshness_window: rawAngle.freshness_window || null,
    created_at: new Date().toISOString()
  };
}

function buildMockTranscriptAngles(sourceDocument, targetCount) {
  const sentences = uniqueBy(
    cleanText(sourceDocument.transcript_text || sourceDocument.raw_text)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => wordCount(sentence) >= 8),
    (sentence) => normalizeText(sentence)
  );
  const pillars = ["craft", "philosophy", "conversion"];

  return sentences.slice(0, Math.max(6, targetCount)).map((sentence, index) =>
    normalizeAngleItem(
      {
        hook: sentence,
        pillar: pillars[index % pillars.length],
        angle_type: index % 4 === 0 ? "teacher_phrase" : index % 3 === 0 ? "actor_mistake" : "lesson",
        actor_relevance: `Turn this class note into a usable actor takeaway: ${sentence}`,
        proof_notes: [
          "Derived from a recorded RAW class transcript.",
          "Use RAW-specific language and practical application."
        ],
        suggested_template_family:
          pillars[index % pillars.length] === "craft"
            ? "craft-tip"
            : pillars[index % pillars.length] === "philosophy"
              ? "philosophy"
              : "behind-the-scenes",
        score: Math.max(55, 92 - index * 3),
        acting_concept: sentence.split(" ").slice(0, 3).join(" "),
        problem: sentence,
        tool: "Translate the note into one clear acting adjustment and one application.",
        cta_type: pillars[index % pillars.length] === "conversion" ? "audit" : "soft",
        audience_stage: pillars[index % pillars.length] === "conversion" ? "hot" : "warm",
        keywords: sentence.split(/\s+/).slice(0, 5),
        source_excerpt: sentence
      },
      sourceDocument,
      index
    )
  );
}

function buildMockArticleAngles(sourceDocument, targetCount) {
  const paragraphs = cleanText(sourceDocument.raw_text)
    .split(/\n{2,}/)
    .filter((paragraph) => wordCount(paragraph) >= 10);
  const pillars = ["craft", "philosophy", "conversion"];

  return paragraphs.slice(0, Math.max(3, targetCount)).map((paragraph, index) =>
    normalizeAngleItem(
      {
        hook: firstSentence(paragraph),
        pillar: pillars[index % pillars.length],
        angle_type: index % 2 === 0 ? "trend_analysis" : "industry_implication",
        actor_relevance: "Explain what this industry shift means for working actors and what to do next.",
        proof_notes: [
          sourceDocument.title,
          "Transform the article into actor-facing analysis, not recap."
        ],
        suggested_template_family:
          index % 2 === 0 ? "philosophy" : TEMPLATE_BY_PILLAR[pillars[index % pillars.length]],
        score: Math.max(60, 88 - index * 6),
        acting_concept: "industry reality",
        problem: firstSentence(paragraph),
        tool: "Translate the news into one usable actor decision.",
        cta_type: "soft",
        audience_stage: "warm",
        keywords: ["actors", "industry", "trend"],
        source_excerpt: firstSentence(paragraph),
        freshness_window: "7d"
      },
      sourceDocument,
      index
    )
  );
}

function buildTranscriptSystemPrompt(data) {
  return `
You extract supplemental social content angles for RAW Actor Studio from class transcripts.

Rules:
- Preserve RAW's tone: direct, practical, exact
- Every angle must map to a concrete acting issue, tool, or room observation
- Pull teacher phrasing or class logic where possible
- No generic self-help language
- Avoid duplicate angles, duplicate hooks, and vague emotional claims

BRAND CORE
${data.brandCore}

CONTENT STRATEGY
${data.contentStrategy}
`;
}

function buildTranscriptPrompt(sourceDocument, targetCount) {
  return `
Analyze this RAW class transcript and return JSON only.

Need between 10 and 20 angles when the source has enough signal.
Target count: ${targetCount}

Transcript title: ${sourceDocument.title}
Transcript:
${clipText(sourceDocument.transcript_text || sourceDocument.raw_text, 18000)}

Return:
{
  "extracted_summary": "short summary",
  "tags": ["tag"],
  "angles": [
    {
      "hook": "specific hook",
      "pillar": "craft|philosophy|conversion",
      "angle_type": "lesson|teacher_phrase|actor_mistake|myth_correction|class_moment",
      "actor_relevance": "why this matters to actors",
      "proof_notes": ["proof note"],
      "suggested_template_family": "craft-tip|philosophy|behind-the-scenes|spotlight",
      "score": 0,
      "acting_concept": "short concept",
      "problem": "specific actor problem",
      "tool": "specific tool or frame",
      "cta_type": "soft|audit|proof",
      "audience_stage": "cold|warm|hot",
      "keywords": ["keyword"],
      "source_excerpt": "short quoted or paraphrased source moment"
    }
  ]
}
`;
}

function buildArticleSystemPrompt(data) {
  return `
You transform entertainment-industry articles into actor-facing commentary for RAW Actor Studio.

Rules:
- Only keep angles that matter to actors
- Do not summarize entertainment news for its own sake
- The output must answer what this means for actors and what actors can do with it
- Reject gossip, vanity, or non-actionable noise
- Never produce close paraphrases of article passages

BRAND CORE
${data.brandCore}

CONTENT STRATEGY
${data.contentStrategy}
`;
}

function buildArticlePrompt(sourceDocument, targetCount) {
  return `
Analyze this article for RAW Actor Studio and return JSON only.

Target angle count: ${targetCount}
If the article is weak, non-actionable, or not actor-relevant, return relevant=false and no angles.

Article title: ${sourceDocument.title}
URL: ${sourceDocument.source_url}
Published at: ${sourceDocument.published_at || "unknown"}
Body:
${clipText(sourceDocument.raw_text, 18000)}

Return:
{
  "relevant": true,
  "rejection_reason": "",
  "extracted_summary": "short summary",
  "tags": ["tag"],
  "angles": [
    {
      "hook": "specific hook",
      "pillar": "craft|philosophy|conversion",
      "angle_type": "trend_analysis|industry_implication|career_tactic",
      "actor_relevance": "why this matters to actors",
      "proof_notes": ["proof note"],
      "suggested_template_family": "craft-tip|philosophy|behind-the-scenes|spotlight",
      "score": 0,
      "acting_concept": "short concept",
      "problem": "specific actor problem",
      "tool": "specific action or lens",
      "cta_type": "soft|audit|proof",
      "audience_stage": "cold|warm|hot",
      "keywords": ["keyword"],
      "source_excerpt": "paraphrased article signal",
      "freshness_window": "7d"
    }
  ]
}
`;
}

async function analyzeTranscript(sourceDocument, data, targetCount, mock) {
  if (mock || !process.env.ANTHROPIC_API_KEY) {
    return {
      extracted_summary: firstSentence(sourceDocument.transcript_text || sourceDocument.raw_text),
      tags: ["class", "transcript", "raw"],
      angles: buildMockTranscriptAngles(sourceDocument, targetCount)
    };
  }

  const result = await callAnthropicJson({
    system: buildTranscriptSystemPrompt(data),
    prompt: buildTranscriptPrompt(sourceDocument, targetCount),
    maxTokens: 3200
  });

  return {
    extracted_summary: cleanText(result.extracted_summary || ""),
    tags: (result.tags || []).map((tag) => cleanText(tag)).filter(Boolean).slice(0, 10),
    angles: (result.angles || []).map((angle, index) =>
      normalizeAngleItem(angle, sourceDocument, index)
    )
  };
}

async function analyzeArticle(sourceDocument, data, targetCount, mock) {
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
    system: buildArticleSystemPrompt(data),
    prompt: buildArticlePrompt(sourceDocument, targetCount),
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

function choosePromotedItems(items, contentOrigin) {
  const limit =
    contentOrigin === "transcript" ? DEFAULT_TRANSCRIPT_PROMOTE : DEFAULT_ARTICLE_PROMOTE;
  return [...items]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function buildSupplementalBrief(item, sourceDocument, date, data) {
  const offerId = CTA_URL_BY_TYPE[item.cta_type] || null;
  const offer = offerId ? data.offersById.get(offerId) : null;

  return {
    angle_id: item.id,
    date,
    pillar: item.pillar,
    weekday: null,
    type: item.suggested_template_family || TEMPLATE_BY_PILLAR[item.pillar] || "craft-tip",
    label: angleLabel(item.angle_type, item.pillar),
    acting_concept: item.acting_concept || item.keywords[0] || item.pillar,
    acting_keywords: uniqueBy(
      [item.acting_concept, ...(item.keywords || []), ...(item.proof_notes || [])].filter(Boolean),
      (value) => normalizeText(value)
    ).slice(0, 8),
    problem: item.problem || item.actor_relevance || item.hook,
    tool: item.tool || item.actor_relevance || "Translate the signal into one usable acting move.",
    cta_type: item.cta_type || "soft",
    offer_id: offer?.id || null,
    cta_url: offer?.cta_url || null,
    audience_stage: item.audience_stage || "warm",
    proof_sources:
      item.content_origin === "article"
        ? ["industry-reality"]
        : ["repeatable-system", "serious-supportive"],
    source_notes: uniqueBy(
      [sourceDocument.title, item.source_excerpt, ...(item.proof_notes || [])].filter(Boolean),
      (value) => normalizeText(value)
    ).slice(0, 6),
    headline_seed: item.hook,
    offer_snapshot: offer || null,
    active_session: null,
    allow_location_copy: false,
    content_origin: item.content_origin,
    source_document_id: item.source_document_id,
    supplemental: true,
    freshness_window: item.freshness_window || null
  };
}

function freshnessAllowsPromotion(item, date) {
  if (item.content_origin !== "article" || !item.freshness_window) {
    return true;
  }

  const allowedDays = parseFreshnessWindow(item.freshness_window);
  if (!allowedDays) {
    return true;
  }

  const latest = new Date();
  latest.setDate(latest.getDate() + allowedDays);
  return new Date(`${date}T12:00:00Z`) <= latest;
}

function findDuplicateDocument(store, sourceDocument) {
  return (store.documents || []).find((document) => {
    if (sourceDocument.source_url && document.source_url) {
      return document.source_url === sourceDocument.source_url;
    }
    return document.content_hash === sourceDocument.content_hash;
  });
}

export async function transcribeAudioBuffer({ buffer, fileName, mimeType }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for audio transcription.");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mimeType || "audio/ogg" }),
    fileName || "telegram-audio.ogg"
  );
  form.append(
    "model",
    process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe"
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Audio transcription failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  return cleanText(payload.text || "");
}

export async function fetchArticleSource(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "RAW Marketing Pipeline/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Article fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const article = extractArticleData(html, sourceUrl);
  if (article.paragraphCount < 3 || wordCount(article.text) < 150) {
    throw new Error("Article content was too thin or unreadable.");
  }

  return article;
}

async function promoteAnglesToQueue({ items, sourceDocument, data, queue, mock }) {
  const scheduledDates = allocateDatesForPillars(
    queue,
    items.map((item) => item.pillar)
  );
  const promotedPosts = [];
  const promotedItems = [];
  const queuePosts = [...(queue.posts || [])];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const date = scheduledDates[index];
    if (!date || !freshnessAllowsPromotion(item, date)) {
      promotedItems.push({
        ...item,
        draft_status: "draft_ready"
      });
      continue;
    }

    const brief = buildSupplementalBrief(item, sourceDocument, date, data);
    const post = await generatePostFromBrief({
      brief,
      data,
      recentContent: queuePosts.map((entry) => ({
        opening: firstSentence(entry.caption),
        angle_id: entry.angle_id,
        headline: entry.headline
      })),
      mock
    });
    queuePosts.push(post);
    promotedPosts.push(post);
    promotedItems.push({
      ...item,
      draft_status: "promoted_to_queue",
      promoted_post_ref: {
        date: post.date,
        angle_id: post.angle_id
      }
    });
  }

  return {
    queue: {
      generated_at: queue.generated_at,
      posts: queuePosts.sort((left, right) =>
        String(left.date || "").localeCompare(String(right.date || ""))
      )
    },
    promotedPosts,
    promotedItems
  };
}

export async function processClassTranscriptSource({
  transcriptText,
  title,
  submittedBy,
  sourceType = "class_transcript",
  data,
  sourceDocuments,
  supplementalBank,
  queue,
  mock = false
}) {
  const normalizedTranscript = cleanText(transcriptText);
  if (wordCount(normalizedTranscript) < 80) {
    throw new Error("Transcript is too short to generate strong content angles.");
  }

  let sourceDocument = buildSourceDocument({
    sourceType,
    title: title || `RAW class ${getTodayIso()}`,
    rawText: normalizedTranscript,
    transcriptText: normalizedTranscript,
    submittedBy
  });

  const duplicate = findDuplicateDocument(sourceDocuments, sourceDocument);
  if (duplicate) {
    throw new Error(`This source was already submitted as ${duplicate.title}.`);
  }

  let nextSourceDocuments = addSourceDocument(sourceDocuments, sourceDocument);
  const analysis = await analyzeTranscript(
    sourceDocument,
    data,
    DEFAULT_TRANSCRIPT_TARGET,
    mock
  );

  const angles = uniqueBy(analysis.angles || [], (item) => normalizeText(item.hook));
  sourceDocument = {
    ...sourceDocument,
    extracted_summary: analysis.extracted_summary,
    tags: analysis.tags,
    processing_status: "processed"
  };
  nextSourceDocuments = updateSourceDocument(nextSourceDocuments, sourceDocument);

  let nextSupplementalBank = addSupplementalItems(supplementalBank, angles);
  const topItems = choosePromotedItems(angles, "transcript");
  const promotion = await promoteAnglesToQueue({
    items: topItems,
    sourceDocument,
    data,
    queue,
    mock
  });
  nextSupplementalBank = updateSupplementalItems(
    nextSupplementalBank,
    promotion.promotedItems
  );

  return {
    sourceDocument,
    sourceDocuments: nextSourceDocuments,
    supplementalBank: nextSupplementalBank,
    queue: promotion.queue,
    createdAngles: angles.length,
    promotedPosts: promotion.promotedPosts
  };
}

export async function processArticleSource({
  sourceUrl,
  submittedBy,
  data,
  sourceDocuments,
  supplementalBank,
  queue,
  mock = false
}) {
  // Create a stub document before the fetch so every submission lands in the
  // audit trail, even if the article is unreachable, paywalled, or too old.
  let sourceDocument = buildSourceDocument({
    sourceType: "industry_article",
    title: sourceUrl,
    rawText: "",
    sourceUrl,
    submittedBy,
    processingStatus: "pending"
  });

  const duplicate = findDuplicateDocument(sourceDocuments, sourceDocument);
  if (duplicate) {
    throw new Error(`This article was already submitted as ${duplicate.title}.`);
  }

  let nextSourceDocuments = addSourceDocument(sourceDocuments, sourceDocument);

  let article;
  try {
    article = await fetchArticleSource(sourceUrl);
  } catch (fetchError) {
    sourceDocument = {
      ...sourceDocument,
      processing_status: "fetch_failed",
      processing_notes: [fetchError.message]
    };
    nextSourceDocuments = updateSourceDocument(nextSourceDocuments, sourceDocument);
    return {
      sourceDocument,
      sourceDocuments: nextSourceDocuments,
      supplementalBank,
      queue,
      createdAngles: 0,
      promotedPosts: []
    };
  }

  const ageDays = ageInDays(article.publishedAt);
  if (ageDays !== null && ageDays > DEFAULT_ARTICLE_MAX_AGE_DAYS) {
    sourceDocument = {
      ...sourceDocument,
      title: article.title || sourceUrl,
      processing_status: "rejected",
      processing_notes: [`Article is too old for trend content (${ageDays} days).`]
    };
    nextSourceDocuments = updateSourceDocument(nextSourceDocuments, sourceDocument);
    return {
      sourceDocument,
      sourceDocuments: nextSourceDocuments,
      supplementalBank,
      queue,
      createdAngles: 0,
      promotedPosts: []
    };
  }

  // Fetch succeeded — update the stub with real content.
  sourceDocument = {
    ...sourceDocument,
    title: article.title,
    raw_text: article.text,
    published_at: article.publishedAt || null
  };

  nextSourceDocuments = updateSourceDocument(nextSourceDocuments, sourceDocument);
  const analysis = await analyzeArticle(
    sourceDocument,
    data,
    DEFAULT_ARTICLE_TARGET,
    mock
  );

  if (!analysis.relevant || !(analysis.angles || []).length) {
    sourceDocument = {
      ...sourceDocument,
      extracted_summary: analysis.extracted_summary,
      tags: analysis.tags,
      processing_status: "rejected",
      processing_notes: [
        ...(sourceDocument.processing_notes || []),
        analysis.rejection_reason || "Article did not produce actor-relevant angles."
      ]
    };
    nextSourceDocuments = updateSourceDocument(nextSourceDocuments, sourceDocument);
    return {
      sourceDocument,
      sourceDocuments: nextSourceDocuments,
      supplementalBank,
      queue,
      createdAngles: 0,
      promotedPosts: []
    };
  }

  const angles = uniqueBy(analysis.angles || [], (item) => normalizeText(item.hook));
  sourceDocument = {
    ...sourceDocument,
    extracted_summary: analysis.extracted_summary,
    tags: analysis.tags,
    processing_status: "processed"
  };
  nextSourceDocuments = updateSourceDocument(nextSourceDocuments, sourceDocument);

  let nextSupplementalBank = addSupplementalItems(supplementalBank, angles);
  const topItems = choosePromotedItems(angles, "article");
  const promotion = await promoteAnglesToQueue({
    items: topItems,
    sourceDocument,
    data,
    queue,
    mock
  });
  nextSupplementalBank = updateSupplementalItems(
    nextSupplementalBank,
    promotion.promotedItems
  );

  return {
    sourceDocument,
    sourceDocuments: nextSourceDocuments,
    supplementalBank: nextSupplementalBank,
    queue: promotion.queue,
    createdAngles: angles.length,
    promotedPosts: promotion.promotedPosts
  };
}
