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

function injectPayload(html, post) {
  const payload = JSON.stringify(post).replace(/</g, "\\u003c");
  return html.replace(
    "<!-- RAW_PAYLOAD -->",
    `<script>window.__RAW_POST__ = ${payload};</script>`
  );
}

export async function renderSinglePost(browser, post, options = {}) {
  const templateName = TEMPLATE_MAP[post.type];
  if (!templateName) {
    throw new Error(`No template defined for post type "${post.type}".`);
  }

  const templatePath = path.join(DATA_PATHS.templates, templateName);
  const html = await fs.readFile(templatePath, "utf8");
  const page = await browser.newPage({
    viewport: {
      width: 1080,
      height: 1080
    },
    deviceScaleFactor: 1
  });

  await page.setContent(injectPayload(html, post), {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(500);

  const outputDir = options.outputDir || DATA_PATHS.approvedPosts;
  await ensureDir(outputDir);
  const fileName = options.fileName || buildPostFilename(post);
  const outputPath = path.join(outputDir, fileName);

  await page.screenshot({
    path: outputPath,
    type: "png"
  });
  await page.close();

  return {
    ...post,
    image_path: path.relative(ROOT_DIR, outputPath).replace(/\\/g, "/"),
    rendered_at: new Date().toISOString()
  };
}

export async function renderQueue(queue, options = {}) {
  const candidates = (queue.posts || []).filter((post) => {
    if (options.force) {
      return true;
    }
    return !post.image_path;
  });

  if (!candidates.length) {
    return {
      rendered: 0,
      queue
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const renderedPosts = [];
    for (const post of queue.posts || []) {
      const shouldRender = candidates.some(
        (candidate) =>
          candidate.date === post.date && candidate.angle_id === post.angle_id
      );

      if (shouldRender) {
        renderedPosts.push(await renderSinglePost(browser, post, options));
      } else {
        renderedPosts.push(post);
      }
    }

    const nextQueue = {
      ...queue,
      posts: renderedPosts
    };

    await writeJsonFile(DATA_PATHS.queue, nextQueue);
    return {
      rendered: candidates.length,
      queue: nextQueue
    };
  } finally {
    await browser.close();
  }
}
