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
  const assets = { logoSrc: "", photoPaths: [] };

  // Logo
  try {
    const buffer = await fs.readFile(path.join(ROOT_DIR, "raw_logo1.png"));
    assets.logoSrc = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    assets.logoSrc = "";
  }

  // Scan photos/ directory for class photos
  try {
    const photosDir = path.join(ROOT_DIR, "photos");
    const entries = await fs.readdir(photosDir);
    assets.photoPaths = entries
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(photosDir, f));
  } catch {
    assets.photoPaths = [];
  }

  return assets;
}

async function resolvePostPhoto(post, sharedAssets) {
  // type-only layout: pure typography, no photo regardless of pool or photo_url
  if (post.layout_variant === "type-only") {
    return { photoUrl: "", photoBgSrc: "" };
  }

  // Explicit photo from post data (external URL) — template loads it directly
  const explicitUrl = post.media?.image_url || post.photo_url || "";
  if (explicitUrl) return { photoUrl: explicitUrl, photoBgSrc: "" };

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
  const templateName = TEMPLATE_MAP[post.type];
  if (!templateName) {
    throw new Error(`No template defined for post type "${post.type}".`);
  }

  const templatePath = path.join(DATA_PATHS.templates, templateName);
  const html = await fs.readFile(templatePath, "utf8");

  const page = await browser.newPage({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1
  });

  // Build per-post browser assets (logo + this post's photo)
  const { photoUrl, photoBgSrc } = await resolvePostPhoto(post, sharedAssets);
  const browserAssets = {
    logoSrc: sharedAssets.logoSrc || "",
    photoBgSrc,     // base64 class photo from local pool
    photoUrl        // external URL if applicable (templates load directly)
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
