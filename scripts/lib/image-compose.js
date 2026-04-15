/**
 * image-compose.js
 *
 * OpenAI-powered photo → designed creative pipeline.
 * Uses GPT-4o vision to analyze a photo, then gpt-image-1
 * to compose it into a RAW Actor Studio branded design.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const require = createRequire(import.meta.url);

async function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for image composition.");
  }
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

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

// ─── STYLE DESCRIPTORS ────────────────────────────────────────────────────────

const STYLE_DESCRIPTORS = {
  // Group B — Cutout Poster
  "poster-yellow": {
    label: "Cutout Poster — Yellow / Black",
    background: "bold solid yellow (#f5c01a) background, no texture",
    treatment: "isolate the people from the background, convert to black and white with high contrast",
    mood: "graphic, poster-style, bold, high energy",
    text_zone: "leave the left 55% of the frame clear and uncluttered for large typography"
  },
  "poster-navy": {
    label: "Cutout Poster — Navy / White",
    background: "deep navy blue (#0d1c2e) background",
    treatment: "isolate the people from the background, convert to black and white with sharp contrast",
    mood: "premium, refined, cinematic poster",
    text_zone: "leave the left 55% of the frame clear for large typography"
  },
  "poster-kraft": {
    label: "Cutout Poster — Kraft / Gold",
    background: "warm amber-gold (#c49540) background",
    treatment: "isolate the people from the background, convert to black and white with warm contrast",
    mood: "editorial, tactile, warm graphic design",
    text_zone: "leave the left 55% of the frame clear for large typography"
  },
  // Group C — Scene Portrait
  "scene-bw-dark": {
    label: "Scene Documentary — B&W Dark",
    background: "near-black dark atmosphere, keep scene composition intact",
    treatment: "convert entire scene to black and white with high contrast, add subtle film grain, dark gradient at bottom",
    mood: "documentary, authentic, dramatic",
    text_zone: "keep the bottom 35% of the frame darker to allow text overlay"
  },
  "scene-color": {
    label: "Scene Documentary — Color Cinematic",
    background: "keep original scene, enhance with cinematic color grading",
    treatment: "boost contrast and shadows, warm highlights, add subtle film grain, dark gradient at bottom for legibility",
    mood: "cinematic, in-the-room, warm editorial",
    text_zone: "keep the bottom 35% of the frame darkened for text"
  },
  "scene-duotone": {
    label: "Scene Documentary — Duotone Gold",
    background: "deep black atmosphere",
    treatment: "apply a gold and black duotone — shadows pure black, highlights warm amber-gold (#d4a520)",
    mood: "editorial, bold, warm luxury",
    text_zone: "keep the bottom 35% darker for text overlay"
  },
  "scene-grain": {
    label: "Scene Documentary — Heavy Grain",
    background: "very dark, almost black",
    treatment: "extreme film grain, high contrast B&W, overexposed highlights, crushed blacks — feels like a damaged photograph",
    mood: "raw, gritty, underground editorial",
    text_zone: "keep the bottom 35% very dark for text"
  },
  // Group D — Bold Editorial
  "editorial-dark": {
    label: "Bold Editorial — Dark",
    background: "near-black (#080808), nearly seamless",
    treatment: "desaturate photo, reduce opacity to 8%, blend into background as a ghost texture",
    mood: "stark, powerful, type-dominant",
    text_zone: "full frame available, photo is barely visible as texture"
  },
  "editorial-yellow": {
    label: "Bold Editorial — Yellow",
    background: "bold yellow (#f5c01a) solid field",
    treatment: "ghost the photo at very low opacity multiply-blended into the yellow",
    mood: "bold, graphic, loud",
    text_zone: "full frame available"
  },
  "editorial-split": {
    label: "Bold Editorial — Diagonal Split",
    background: "left half near-black, right half bold yellow, split diagonally",
    treatment: "photo ghosted at low opacity on the right yellow half",
    mood: "dynamic, split personality, editorial tension",
    text_zone: "type spans the diagonal split"
  },
  "editorial-minimal": {
    label: "Bold Editorial — Minimal",
    background: "off-white (#f2ede6), clean",
    treatment: "photo removed or ghosted at 5% opacity as faint texture",
    mood: "clean, sophisticated, understated",
    text_zone: "full frame, centred composition"
  },
  // Group E — Experimental
  "exp-ruled": {
    label: "Experimental — Ruled Dividers",
    background: "near-black with subtle horizontal gold rule lines at top and bottom thirds",
    treatment: "no photo or ghost photo at very low opacity",
    mood: "structured, architectural, precise",
    text_zone: "full frame"
  },
  "exp-grain": {
    label: "Experimental — Grain Washed",
    background: "very dark brown-black",
    treatment: "heavily grain-washed, B&W high contrast, underexposed, raw film look",
    mood: "lo-fi, underground, intense",
    text_zone: "full frame, slightly darker in bottom third"
  },
  "exp-contrast": {
    label: "Experimental — High Contrast B&W",
    background: "pure black",
    treatment: "extreme B&W contrast — near solarisation, graphic halftone quality",
    mood: "graphic novel, extreme, high impact",
    text_zone: "full frame"
  },
  "exp-geo": {
    label: "Experimental — Geometric Accent",
    background: "near-black with subtle gold geometric shapes: hollow circle top-right, thin diagonal line, small squares",
    treatment: "no photo or ghost at low opacity",
    mood: "architectural, design-forward, premium",
    text_zone: "full frame"
  }
};

// ─── SCENE ANALYSIS ───────────────────────────────────────────────────────────

/**
 * Analyse a photo buffer with GPT-4o vision.
 * Returns a description of the scene and a suggested style.
 */
export async function analyzePhoto(imageBuffer) {
  const openai = await getOpenAI();
  const base64 = imageBuffer.toString("base64");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" }
          },
          {
            type: "text",
            text: `You are a creative director for RAW Actor Studio, a Toronto acting school.
Analyse this photo and return a JSON object with:
- "scene": one sentence describing what is happening (people, action, setting)
- "subject_count": number of visible people
- "is_single_portrait": true if one person facing camera with clean-ish background
- "has_action": true if people are in motion or mid-scene work
- "suggested_style": one of "cutout" (for clean single portraits) or "scene" (for candids/multi-person/action)
- "lighting": one word: "warm", "cool", "neutral", or "mixed"

Return raw JSON only, no markdown.`
          }
        ]
      }
    ]
  });

  try {
    return JSON.parse(response.choices[0].message.content.trim());
  } catch {
    return {
      scene: "Acting class in progress",
      subject_count: 1,
      is_single_portrait: false,
      has_action: true,
      suggested_style: "scene",
      lighting: "warm"
    };
  }
}

// ─── PROMPT BUILDER ───────────────────────────────────────────────────────────

/**
 * Build a composition prompt for gpt-image-1 based on the style variant
 * and GPT-4o scene analysis.
 */
export function buildCompositionPrompt({ variantId, analysis, userNotes = "" }) {
  const style = STYLE_DESCRIPTORS[variantId];
  if (!style) {
    throw new Error(`Unknown variant: ${variantId}`);
  }

  const sceneDesc = analysis?.scene || "actors working in a class setting";
  const lightingNote = analysis?.lighting === "warm"
    ? "The original photo has warm lighting — lean into that."
    : analysis?.lighting === "cool"
    ? "The original photo has cool/neutral lighting."
    : "";

  const lines = [
    `Transform this photo into a RAW Actor Studio editorial Instagram post background.`,
    ``,
    `Scene: ${sceneDesc}`,
    `Style: ${style.label}`,
    ``,
    `Background: ${style.background}`,
    `Photo treatment: ${style.treatment}`,
    `Mood: ${style.mood}`,
    `Composition: ${style.text_zone}`,
    lightingNote,
    ``,
    `Brand rules:`,
    `- RAW Actor Studio uses gold (#d4a520), black, and white as core brand colours`,
    `- Cinematic, professional, not generic or cheerful`,
    `- Film grain texture is part of the aesthetic`,
    `- NO text, NO logos, NO overlays — clean background image only`,
    `- Output must be square 1:1 unless told otherwise`,
    ``,
    `CRITICAL — face preservation:`,
    `- Every face in the photo must be reproduced EXACTLY as it appears in the original`,
    `- Do NOT reinterpret, retouch, smooth, alter, or AI-generate any face`,
    `- Facial features, expressions, skin tone, and likeness must be pixel-faithful to the source`,
    `- If you cannot preserve a face exactly, keep the original face unchanged and apply all other treatments around it`,
    userNotes ? `\nAdditional notes: ${userNotes}` : ""
  ].filter((l) => l !== undefined).join("\n").trim();

  return lines;
}

// ─── IMAGE COMPOSITION ────────────────────────────────────────────────────────

/**
 * Compose a photo using gpt-image-1 image editing.
 * Returns a Buffer of the composed image (PNG).
 */
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

// ─── FULL PIPELINE ────────────────────────────────────────────────────────────

/**
 * Full pipeline: analyze → build prompt → compose.
 * Returns { composedBuffer, prompt, analysis }.
 */
export async function runCompositionPipeline({ imageBuffer, variantId, userPromptOverride = null }) {
  // Skip analyzePhoto if we already have a prompt — saves 3-5s of GPT-4o latency
  const analysis = userPromptOverride ? null : await analyzePhoto(imageBuffer);
  const prompt = userPromptOverride || buildCompositionPrompt({ variantId, analysis });
  const composedBuffer = await composeImage({ imageBuffer, prompt });
  return { composedBuffer, prompt, analysis };
}
