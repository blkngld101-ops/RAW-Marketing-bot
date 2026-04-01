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
