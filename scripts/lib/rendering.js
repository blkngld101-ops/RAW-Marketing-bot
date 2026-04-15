import fs from "node:fs/promises";
import path from "node:path";

import {
  DATA_PATHS,
  ROOT_DIR,
  buildPostFilename,
  ensureDir,
  writeJsonFile
} from "./raw-core.js";

const TEMPLATE_MAP = {
  "craft-tip": "craft-tip.html",
  philosophy: "philosophy.html",
  enrollment: "enrollment.html",
  spotlight: "spotlight.html",
  "behind-the-scenes": "behind-the-scenes.html"
};

// design_variant → { template, theme, format }
const DESIGN_VARIANT_MAP = {
  // Group A — Dark Cinema (use existing templates, handled via layout_variant)
  "dark-type":  { template: null, theme: null, format: "square" },
  "dark-split": { template: null, theme: null, format: "square" },
  "dark-full":  { template: null, theme: null, format: "square" },
  // Group B — Cutout Poster
  "poster-yellow": { template: "cutout-poster.html", theme: "yellow", format: "square" },
  "poster-navy":   { template: "cutout-poster.html", theme: "navy",   format: "square" },
  "poster-kraft":  { template: "cutout-poster.html", theme: "kraft",  format: "square" },
  // Group C — Scene Portrait
  "scene-bw-dark": { template: "scene-portrait.html", theme: "bw-dark",  format: "portrait" },
  "scene-color":   { template: "scene-portrait.html", theme: "color",    format: "portrait" },
  "scene-duotone": { template: "scene-portrait.html", theme: "duotone",  format: "portrait" },
  "scene-grain":   { template: "scene-portrait.html", theme: "grain",    format: "portrait" },
  // Group D — Bold Editorial
  "editorial-dark":    { template: "bold-editorial.html", theme: "dark",    format: "square" },
  "editorial-yellow":  { template: "bold-editorial.html", theme: "yellow",  format: "square" },
  "editorial-split":   { template: "bold-editorial.html", theme: "split",   format: "square" },
  "editorial-minimal": { template: "bold-editorial.html", theme: "minimal", format: "square" },
  // Group E — Experimental
  "exp-ruled":    { template: "experimental.html", theme: "ruled",    format: "square" },
  "exp-grain":    { template: "experimental.html", theme: "grain",    format: "square" },
  "exp-contrast": { template: "experimental.html", theme: "contrast", format: "square" },
  "exp-geo":      { template: "experimental.html", theme: "geo",      format: "square" }
};

const VIEWPORTS = {
  square:   { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 }
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function injectPayload(html, post, assets = {}) {
  const payload = JSON.stringify(post).replace(/</g, "\\u003c");
  const assetsJson = JSON.stringify(assets).replace(/</g, "\\u003c");
  return html.replace(
    "<!-- RAW_PAYLOAD -->",
    `<script>window.__RAW_POST__ = ${payload}; window.__RAW_ASSETS__ = ${assetsJson};</script>`
  );
}

async function loadAssets() {
  const assets = { logoSrc: "", photoPaths: [], bankPhotoUrls: [] };

  // Logo
  try {
    const buffer = await fs.readFile(path.join(ROOT_DIR, "raw_logo1.png"));
    assets.logoSrc = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    assets.logoSrc = "";
  }

  // Scan photos/ directory for local class photos
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

async function resolvePostPhoto(post, sharedAssets) {
  // type-only layout: pure typography, no photo regardless of pool or photo_url
  if (post.layout_variant === "type-only") {
    return { photoUrl: "", photoBgSrc: "" };
  }

  // Explicit photo from post data (external URL or attribution portrait)
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

export async function renderSinglePost(browser, post, options = {}, sharedAssets = {}) {
  // Resolve template: design_variant overrides post.type
  const variantConfig = post.design_variant
    ? DESIGN_VARIANT_MAP[post.design_variant]
    : null;

  const templateName = (variantConfig?.template) || TEMPLATE_MAP[post.type];
  if (!templateName) {
    throw new Error(`No template defined for post type "${post.type}" / variant "${post.design_variant}".`);
  }

  const format = variantConfig?.format || "square";
  const viewport = VIEWPORTS[format] || VIEWPORTS.square;

  const templatePath = path.join(DATA_PATHS.templates, templateName);
  const html = await fs.readFile(templatePath, "utf8");

  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1
  });

  // Build per-post browser assets (logo + this post's photo)
  const { photoUrl, photoBgSrc } = await resolvePostPhoto(post, sharedAssets);
  const browserAssets = {
    logoSrc: sharedAssets.logoSrc || "",
    photoBgSrc,     // base64 class photo from local pool
    photoUrl,       // external URL if applicable (templates load directly)
    theme: variantConfig?.theme || null
  };

  await page.setContent(injectPayload(html, post, browserAssets), {
    waitUntil: "networkidle"
  });
  await page.waitForTimeout(300);

  const outputDir = options.outputDir || DATA_PATHS.approvedPosts;
  await ensureDir(outputDir);
  const fileName = options.fileName || buildPostFilename(post);
  const outputPath = path.join(outputDir, fileName);

  await page.screenshot({ path: outputPath, type: "png" });
  await page.close();

  return {
    ...post,
    image_path: path.relative(ROOT_DIR, outputPath).replace(/\\/g, "/"),
    rendered_at: new Date().toISOString()
  };
}

export async function renderQueue(queue, options = {}) {
  const candidates = (queue.posts || []).filter((post) => {
    if (options.force) return true;
    return !post.image_path;
  });

  if (!candidates.length) {
    return { rendered: 0, queue };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const sharedAssets = await loadAssets();
    const renderedPosts = [];

    for (const post of queue.posts || []) {
      const shouldRender = candidates.some(
        (c) => c.date === post.date && c.angle_id === post.angle_id
      );

      if (shouldRender) {
        renderedPosts.push(await renderSinglePost(browser, post, options, sharedAssets));
      } else {
        renderedPosts.push(post);
      }
    }

    const nextQueue = { ...queue, posts: renderedPosts };
    await writeJsonFile(DATA_PATHS.queue, nextQueue);
    return { rendered: candidates.length, queue: nextQueue };
  } finally {
    await browser.close();
  }
}
