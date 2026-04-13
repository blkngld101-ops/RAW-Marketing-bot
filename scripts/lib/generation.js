import {
  DATA_PATHS,
  buildAngleBriefs,
  buildPublishingSlots,
  dedupeHashtags,
  firstSentence,
  getQueueDepth,
  getRecentContent,
  loadProjectData,
  nextScheduleStartDate,
  normalizeText,
  resolveActiveSession,
  wordCount,
  writeJsonFile
} from "./raw-core.js";
import { runExpertPanel } from "./expert-panel.js";

const BRAND_HASHTAGS = ["#RAWActorStudio", "#ActingToronto", "#OnCameraActing"];
const GENERIC_TRIGGER_PHRASES = [
  "unlock your potential",
  "follow your dreams",
  "chase your passion",
  "level up",
  "best version of yourself",
  "transform your life",
  "step into your power"
];
const VAGUE_TERMS = [
  "confidence",
  "growth",
  "authenticity",
  "vulnerability",
  "journey",
  "energy"
];
const RAW_SPECIFIC_MARKERS = [
  "raw",
  "audit",
  "audition",
  "self-tape",
  "on camera",
  "objective",
  "action",
  "specificity",
  "script analysis",
  "taking direction",
  "industry"
];

function parseArgs(argv) {
  const options = {
    count: 6,
    minQueue: Number(process.env.RAW_QUEUE_MIN || 6),
    startDate: null,
    mock: process.env.MOCK_GENERATION === "1",
    force: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--count" && next) {
      options.count = Number(next);
      index += 1;
    } else if (token === "--min-queue" && next) {
      options.minQueue = Number(next);
      index += 1;
    } else if (token === "--start-date" && next) {
      options.startDate = next;
      index += 1;
    } else if (token === "--mock") {
      options.mock = true;
    } else if (token === "--force") {
      options.force = true;
    }
  }

  return options;
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

  throw new Error("Model response did not contain valid JSON.");
}

function getProofSummary(brief, data) {
  return (brief.proof_sources || [])
    .map((id) => data.proofById.get(id))
    .filter(Boolean)
    .map((entry) => ({
      id: entry.id,
      summary: entry.summary || entry.label || entry.name,
      source_url: entry.source_url || (entry.source_urls || [])[0] || null
    }));
}

function buildPrompt({ brief, data, recentContent }) {
  const proofEntries = getProofSummary(brief, data);
  const offer = brief.offer_snapshot;
  const session = brief.active_session;

  return `
You are generating Instagram content for RAW Actor Studio in Toronto.

Non-negotiable brand rules:
- No generic motivation
- No hobbyist language
- No fake urgency
- No invented facts
- No invented testimonials
- One clear idea per post
- One CTA at most
- The copy must sound like RAW specifically, not a generic acting studio

Angle brief:
${JSON.stringify(
    {
      pillar: brief.pillar,
      date: brief.date,
      type: brief.type,
      label: brief.label,
      acting_concept: brief.acting_concept,
      problem: brief.problem,
      tool: brief.tool,
      cta_type: brief.cta_type,
      cta_url: brief.cta_url,
      offer: offer
        ? {
            id: offer.id,
            name: offer.name,
            positioning: offer.positioning,
            price_cad: offer.price_cad,
            tax_note: offer.tax_note,
            payment_options: offer.payment_options
          }
        : null,
      session,
      proof_entries: proofEntries,
      source_notes: brief.source_notes,
      recent_openings: (recentContent || []).map((item) => item.opening).filter(Boolean)
    },
    null,
    2
  )}

${brief.pillar === "philosophy" && data.quoteBank?.length ? `
Available quotes to choose from (pick ONE that best fits the angle — use exact text, do not paraphrase):
${JSON.stringify(
  data.quoteBank.map((q) => ({
    id: q.id,
    text: q.text,
    attribution_name: q.attribution_name,
    attribution_sub: q.attribution_sub,
    attribution_pool: q.pool,
    attribution_photo_url: q.photo_url || "",
    tags: q.tags
  })),
  null,
  2
)}

Rules for quote selection:
- Use the EXACT text field as the "headline" value
- Copy attribution_name, attribution_sub, attribution_pool, attribution_photo_url exactly from the chosen entry
- The caption should discuss WHY this quote matters to working actors, connecting it to RAW's approach
- Do not mix quotes from different people
` : ""}
Return JSON only in this shape:
{
  "headline": "max 10 words",
  "label": "2-4 words",
  "image_body": "max 40 words",
  "caption": "80-180 words",
  "hashtags": ["#RAWActorStudio"],
  "proof_sources": ["repeatable-system"],
  "source_notes": ["short source anchor"],
  "layout_variant": "text-led or photo-led",
  "visual_direction": "brief rendering note"${brief.pillar === "craft" ? `,
  "blog_seo_title": "SEO-optimised title (60 chars max, target keyword first)",
  "blog_meta_description": "140-155 char meta description with a clear value prop",
  "blog_target_keyword": "primary search keyword phrase (e.g. 'how to cold read an audition')",
  "blog_article": "600-900 word article. Plain paragraphs separated by blank lines. No markdown headers or bullet points. Lead with a direct answer to the target keyword. Use real technique language throughout. Tie every point to RAW's repeatable system approach. End with a single CTA to book a free audit at rawactorstudio.com."` : ""}${brief.pillar === "philosophy" ? `,
  "attribution_name": "person name if quoting an external source, or 'RAW Actor Studio'",
  "attribution_sub": "book title or source context, or empty for RAW-authored posts",
  "attribution_pool": "pool letter A/B/C/D/E matching the source pool, or empty for RAW posts",
  "attribution_photo_url": "use photo_url from quote-bank entry if available, otherwise empty string"` : ""}
}
`;
}

function buildSystemPrompt(data) {
  return `
You are RAW Actor Studio's editorial engine.

Use these source documents as the truth:

BRAND CORE
${data.brandCore}

CONTENT STRATEGY
${data.contentStrategy}

OFFERS JSON
${JSON.stringify(data.offers, null, 2)}

PROOF BANK JSON
${JSON.stringify(data.proofBank, null, 2)}

Rules:
- Prefer direct, exact phrasing
- Tie abstract terms to an acting situation
- If a fact is not verified, avoid saying it
- Do not mention a street address unless explicitly given in the angle brief
- Keep hashtags to 6-10 total
- Do not repeat the same opening shape as recent posts
- Never output markdown, explanation, or extra keys
`;
}

function buildRevisionPrompt({ post, feedback, data, recentContent }) {
  return `
Revise this RAW Actor Studio Instagram post using the feedback.

Current post:
${JSON.stringify(post, null, 2)}

Feedback:
${feedback}

Recent openings to avoid:
${JSON.stringify((recentContent || []).map((item) => item.opening).filter(Boolean), null, 2)}

Keep all facts aligned with the source documents below.
Do not change the post type, CTA type, offer id, or audience stage unless the current draft is factually unsafe.

Source docs:
BRAND CORE
${data.brandCore}

CONTENT STRATEGY
${data.contentStrategy}

OFFERS JSON
${JSON.stringify(data.offers, null, 2)}

PROOF BANK JSON
${JSON.stringify(data.proofBank, null, 2)}

Return JSON only in this shape:
{
  "headline": "max 10 words",
  "label": "2-4 words",
  "image_body": "max 40 words",
  "caption": "80-180 words",
  "hashtags": ["#RAWActorStudio"],
  "proof_sources": ["repeatable-system"],
  "source_notes": ["short source anchor"],
  "layout_variant": "text-led or photo-led",
  "visual_direction": "brief rendering note"
}
`;
}

function buildMockCaption(brief, proofSummary) {
  const firstProof =
    proofSummary[0]?.summary || brief.source_notes[0] || "RAW teaches with clarity.";
  const offerName = brief.offer_snapshot?.name;
  const ctaLine =
    brief.cta_type === "audit"
      ? "If you want a clear read on where your process holds and where it breaks, book the free audit."
      : brief.cta_type === "enrollment" && offerName
        ? `If you want that process in a room that expects precision, look at ${offerName}.`
        : brief.cta_type === "reels"
          ? "If the next move is better proof of your work, look at RAW Reels."
          : "If you need a room that sharpens the work, start by learning how RAW trains.";

  return [
    `${brief.problem} That is usually where actors start performing effort instead of solving the scene.`,
    `${brief.tool} RAW's standard is clarity you can repeat when the camera is on and the pressure is real.`,
    `${firstProof} ${ctaLine}`
  ].join("\n\n");
}

function buildMockDraft(brief, data) {
  const proofSummary = getProofSummary(brief, data);
  const offer = brief.offer_snapshot;
  const fallbackHeadline = String(
    brief.headline_seed || brief.problem || brief.label || "RAW Actor Studio"
  )
    .replace(/[.?!].*$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(" ");
  const headlineMap = {
    craft: {
      "cold-read-first-pass": "Make The First Pass Count",
      "playable-actions": "Feelings Are Not Actions",
      "taking-direction-fast": "Translate Direction Fast",
      "self-tape-under-pressure": "Shrink The Self-Tape Panic",
      "script-analysis-no-overthinking": "Cut The Overthinking",
      "specificity-beats": "Find The Beat Change"
    },
    philosophy: {
      "authorship-over-guessing": "Stop Guessing. Start Owning.",
      "clarity-is-kindness": "Clarity Is A Better Coach",
      "serious-supportive-room": "Serious Does Not Mean Cruel",
      "all-levels-genuinely-welcome": "All Levels Means All Levels",
      "lineage-meets-now": "Technique Has To Hold Now",
      "acting-is-a-job": "Train For Real Conditions"
    },
    conversion: {
      "audit-gap-check": "See Where The Work Breaks",
      "master-class-system": "Build A Repeatable Process",
      "audition-class-system": "Get Clearer In Audition Prep",
      "reels-proof-of-work": "Proof Beats Promise",
      "student-proof-room": "What The Room Feels Like",
      "student-returns-to-master": "Why Actors Come Back"
    }
  };

  const headline =
    headlineMap[brief.pillar]?.[brief.angle_id] ||
    fallbackHeadline;

  const body =
    brief.type === "enrollment"
      ? `${brief.tool} ${offer?.name ? `${offer.name} is built for that.` : "RAW trains that directly."}`
      : `${brief.problem} ${brief.tool}`;

  return {
    headline,
    label: brief.label,
    image_body: body.slice(0, 220),
    caption: buildMockCaption(brief, proofSummary),
    hashtags: dedupeHashtags([
      ...BRAND_HASHTAGS,
      brief.pillar === "craft" ? "#ActingTechnique" : "#ActorTraining",
      brief.cta_type === "audit" ? "#ActingAudit" : "#TorontoActors",
      brief.cta_type === "reels" ? "#DemoReel" : "#AuditionPrep"
    ]),
    proof_sources: brief.proof_sources,
    source_notes: brief.source_notes,
    layout_variant: brief.cta_type === "reels" ? "photo-led" : "text-led",
    visual_direction:
      brief.cta_type === "reels"
        ? "Use a photo-led frame with cinematic crop and proof-of-work energy."
        : "Use a text-led frame with strong hierarchy and restrained cinematic texture.",
    ...(brief.pillar === "craft"
      ? {
          blog_seo_title: `${headline} — RAW Actor Studio Toronto`,
          blog_meta_description: `Learn how to work with ${brief.acting_concept} in on-camera auditions. RAW Actor Studio's approach to craft training in Toronto.`,
          blog_target_keyword: brief.acting_concept,
          blog_article: `${buildMockCaption(brief, proofSummary)}\n\nThis is the standard RAW trains to. Not confidence — clarity. Not inspiration — process.\n\nIf you want to find out where your own work holds and where it breaks, book a free audit at rawactorstudio.com.`
        }
      : {})
  };
}

async function requestAnthropicDraft({ brief, data, recentContent }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required unless --mock is used.");
  }

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 1200,
    system: buildSystemPrompt(data),
    messages: [
      {
        role: "user",
        content: buildPrompt({
          brief,
          data,
          recentContent
        })
      }
    ]
  });

  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  return JSON.parse(extractJson(text));
}

async function requestAnthropicRevision({ post, feedback, data, recentContent }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required unless --mock is used.");
  }

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 1200,
    system: buildSystemPrompt(data),
    messages: [
      {
        role: "user",
        content: buildRevisionPrompt({
          post,
          feedback,
          data,
          recentContent
        })
      }
    ]
  });

  const text = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  return JSON.parse(extractJson(text));
}

function sanitizeDraft(draft, brief) {
  const label = String(draft.label || brief.label || "").trim();
  const sourceNotes = Array.isArray(draft.source_notes)
    ? draft.source_notes.map((item) => String(item).trim()).filter(Boolean)
    : [...brief.source_notes];

  const sanitized = {
    headline: String(draft.headline || "").trim(),
    label: label || brief.label,
    image_body: String(draft.image_body || "").trim(),
    caption: String(draft.caption || "").trim(),
    hashtags: dedupeHashtags(draft.hashtags || BRAND_HASHTAGS),
    proof_sources: Array.isArray(draft.proof_sources)
      ? draft.proof_sources.filter(Boolean)
      : [...brief.proof_sources],
    source_notes: sourceNotes.length ? sourceNotes : [...brief.source_notes],
    layout_variant:
      draft.layout_variant === "photo-led" ? "photo-led" : "text-led",
    visual_direction: String(draft.visual_direction || "").trim()
  };

  if (brief.pillar === "craft") {
    sanitized.blog_seo_title = String(draft.blog_seo_title || "").trim();
    sanitized.blog_meta_description = String(draft.blog_meta_description || "").trim();
    sanitized.blog_target_keyword = String(draft.blog_target_keyword || "").trim();
    sanitized.blog_article = String(draft.blog_article || "").trim();
  }

  if (brief.pillar === "philosophy") {
    sanitized.attribution_name = String(draft.attribution_name || "").trim();
    sanitized.attribution_sub = String(draft.attribution_sub || "").trim();
    sanitized.attribution_pool = String(draft.attribution_pool || "").trim();
    sanitized.attribution_photo_url = String(draft.attribution_photo_url || "").trim();
  }

  return sanitized;
}

export function lintGeneratedPost(post, brief, data, recentContent) {
  const issues = [];
  const combined = [post.headline, post.image_body, post.caption].join(" ");
  const normalized = normalizeText(combined);

  if (!post.headline) {
    issues.push("Missing headline.");
  }

  // Philosophy posts use the full quote text as the headline — skip the word
  // limit for those since the prompt explicitly requires the exact quote.
  const isQuotePost = brief.pillar === "philosophy" && Boolean(post.attribution_name);
  if (!isQuotePost && wordCount(post.headline) > 10) {
    issues.push("Headline exceeds 10 words.");
  }

  if (wordCount(post.image_body) > 40) {
    issues.push("Image body exceeds 40 words.");
  }

  if (wordCount(post.caption) < 45) {
    issues.push("Caption is too short to be useful.");
  }

  if (wordCount(post.caption) > 200) {
    issues.push("Caption is too long and likely padded.");
  }

  for (const phrase of GENERIC_TRIGGER_PHRASES) {
    if (normalized.includes(normalizeText(phrase))) {
      issues.push(`Uses banned generic phrase: "${phrase}".`);
    }
  }

  const vagueHits = VAGUE_TERMS.filter((term) => normalized.includes(term));
  if (vagueHits.length >= 3) {
    issues.push("Uses too many vague emotional abstractions.");
  }

  if (
    !brief.acting_keywords.some((keyword) =>
      normalized.includes(normalizeText(keyword))
    )
  ) {
    issues.push("Missing the assigned acting concept in the copy itself.");
  }

  if (!post.proof_sources.length) {
    issues.push("Missing proof source anchors.");
  }

  const invalidProofSources = post.proof_sources.filter((id) => !data.proofById.has(id));
  if (invalidProofSources.length) {
    issues.push(`Unknown proof sources: ${invalidProofSources.join(", ")}.`);
  }

  const normalizedOpening = normalizeText(firstSentence(post.caption));
  const repeatedOpening = (recentContent || []).some(
    (entry) => normalizeText(entry.opening) === normalizedOpening && normalizedOpening
  );
  if (repeatedOpening) {
    issues.push("Opening sentence repeats a recent post.");
  }

  const hasRawMarker = RAW_SPECIFIC_MARKERS.some((marker) =>
    normalized.includes(normalizeText(marker))
  );
  if (!hasRawMarker) {
    issues.push("Copy is too generic and lacks RAW-specific craft language.");
  }

  if (!brief.allow_location_copy && /\b(dupont|king st|college st)\b/i.test(combined)) {
    issues.push("Uses unresolved location details.");
  }

  if (!post.cta_url && ["audit", "enrollment", "reels"].includes(post.cta_type)) {
    issues.push("Conversion post is missing a CTA URL.");
  }

  if (post.hashtags.length < 4 || post.hashtags.length > 12) {
    issues.push("Hashtag count should stay between 4 and 12.");
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function buildPostRecord(draft, brief, lintResult) {
  const nowIso = new Date().toISOString();
  return {
    type: brief.type,
    date: brief.date,
    headline: draft.headline,
    label: draft.label,
    image_body: draft.image_body,
    caption: draft.caption,
    hashtags: draft.hashtags,
    status: lintResult.ok ? "pending" : "needs_revision",
    cta_type: brief.cta_type,
    cta_url: brief.cta_url,
    audience_stage: brief.audience_stage,
    proof_sources: draft.proof_sources,
    source_notes: draft.source_notes,
    angle_id: brief.angle_id,
    review_notes: lintResult.ok
      ? []
      : lintResult.issues.map((issue) => ({
          source: "voice-lint",
          note: issue,
          recorded_at: nowIso
        })),
    acting_concept: brief.acting_concept,
    offer_id: brief.offer_id,
    layout_variant: draft.layout_variant,
    visual_direction: draft.visual_direction,
    content_origin: brief.content_origin || "system",
    source_document_id: brief.source_document_id || null,
    supplemental: Boolean(brief.supplemental),
    freshness_window: brief.freshness_window || null,
    generated_at: nowIso,
    image_path: null,
    blog_seo_title: draft.blog_seo_title || null,
    blog_meta_description: draft.blog_meta_description || null,
    blog_target_keyword: draft.blog_target_keyword || null,
    blog_article: draft.blog_article || null,
    attribution_name: draft.attribution_name || null,
    attribution_sub: draft.attribution_sub || null,
    attribution_pool: draft.attribution_pool || null,
    attribution_photo_url: draft.attribution_photo_url || null
  };
}

function briefFromExistingPost(post, data) {
  return {
    angle_id: post.angle_id,
    date: post.date,
    pillar:
      post.type === "craft-tip"
        ? "craft"
        : post.type === "philosophy"
          ? "philosophy"
          : "conversion",
    weekday: null,
    type: post.type,
    label: post.label,
    acting_concept: post.acting_concept,
    acting_keywords: [post.acting_concept, ...(post.source_notes || [])]
      .filter(Boolean)
      .map((item) => String(item).toLowerCase()),
    problem: post.image_body,
    tool: post.image_body,
    cta_type: post.cta_type,
    offer_id: post.offer_id,
    cta_url: post.cta_url,
    audience_stage: post.audience_stage,
    proof_sources: post.proof_sources || [],
    source_notes: post.source_notes || [],
    offer_snapshot: post.offer_id ? data.offersById.get(post.offer_id) : null,
    active_session: null,
    allow_location_copy: false,
    content_origin: post.content_origin || "system",
    source_document_id: post.source_document_id || null,
    supplemental: Boolean(post.supplemental),
    freshness_window: post.freshness_window || null
  };
}

export async function generatePostFromBrief({
  brief,
  data,
  recentContent = [],
  mock = false
}) {
  const rawDraft = mock
    ? buildMockDraft(brief, data)
    : await requestAnthropicDraft({
        brief,
        data,
        recentContent
      });

  const draft = sanitizeDraft(rawDraft, brief);
  draft.cta_type = brief.cta_type;
  draft.cta_url = brief.cta_url;
  const lintResult = lintGeneratedPost(
    {
      ...draft,
      cta_type: brief.cta_type,
      cta_url: brief.cta_url
    },
    brief,
    data,
    recentContent
  );

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
}

export async function reviseExistingPost({
  post,
  feedback,
  data,
  recentContent = [],
  mock = false
}) {
  const brief = briefFromExistingPost(post, data);
  const rawDraft = mock
    ? {
        ...post,
        caption: `${post.caption}\n\nRevision focus: ${feedback}`,
        visual_direction: post.visual_direction || "Revised after review."
      }
    : await requestAnthropicRevision({
        post,
        feedback,
        data,
        recentContent
      });

  const draft = sanitizeDraft(rawDraft, brief);
  draft.cta_type = brief.cta_type;
  draft.cta_url = brief.cta_url;
  const lintResult = lintGeneratedPost(
    {
      ...draft,
      cta_type: brief.cta_type,
      cta_url: brief.cta_url
    },
    brief,
    data,
    recentContent
  );

  return {
    ...buildPostRecord(
      {
        ...draft,
        cta_type: brief.cta_type,
        cta_url: brief.cta_url
      },
      brief,
      lintResult
    ),
    image_path: null
  };
}

export async function generatePosts(options = {}) {
  const settings = {
    ...parseArgs(process.argv.slice(2)),
    ...options
  };
  const data = await loadProjectData();
  const queueDepth = getQueueDepth(data.queue);

  if (!settings.force && queueDepth >= settings.minQueue) {
    return {
      skipped: true,
      reason: `Queue depth ${queueDepth} already meets minimum ${settings.minQueue}.`,
      queue: data.queue
    };
  }

  const startDate = settings.startDate || nextScheduleStartDate(data.queue);
  const slots = buildPublishingSlots({
    count: settings.count,
    startDate
  });
  const recentContent = getRecentContent(data.queue, data.reviewMemory, 14);
  const activeSession = resolveActiveSession(data.sessions);
  const briefs = buildAngleBriefs({
    slots,
    recentContent,
    activeSession,
    offersData: data,
    proofById: data.proofById
  });

  const generatedPosts = [];
  for (const brief of briefs) {
    const post = await generatePostFromBrief({
      brief,
      data,
      recentContent: [
        ...recentContent,
        ...generatedPosts.map((entry) => ({
          opening: firstSentence(entry.caption),
          angle_id: entry.angle_id,
          headline: entry.headline
        }))
      ],
      mock: settings.mock
    });
    generatedPosts.push(post);
  }

  const queue = {
    generated_at: new Date().toISOString(),
    posts: [...(data.queue.posts || []), ...generatedPosts].sort((left, right) =>
      String(left.date || "").localeCompare(String(right.date || ""))
    )
  };

  await writeJsonFile(DATA_PATHS.queue, queue);
  return {
    skipped: false,
    created: generatedPosts.length,
    queue
  };
}
