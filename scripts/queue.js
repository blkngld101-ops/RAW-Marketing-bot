import path from "node:path";

import {
  DATA_PATHS,
  getTodayIso,
  readJsonFile,
  writeJsonFile
} from "./lib/raw-core.js";

const GITHUB_API_ROOT = "https://api.github.com";

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

function encodeContent(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8").toString(
    "base64"
  );
}

function parseRepo(repo) {
  const [owner, name] = String(repo || "").split("/");
  if (!owner || !name) {
    throw new Error("GITHUB_REPO must be in owner/repo format.");
  }
  return { owner, name };
}

async function getGitHubJson(token, repo, targetPath, fallback) {
  const { owner, name } = parseRepo(repo);
  const response = await fetch(
    `${GITHUB_API_ROOT}/repos/${owner}/${name}/contents/${targetPath}`,
    {
      headers: getHeaders(token)
    }
  );

  if (response.status === 404) {
    return { data: fallback, sha: null };
  }

  if (!response.ok) {
    throw new Error(`GitHub read failed for ${targetPath}: ${response.status}`);
  }

  const payload = await response.json();
  const decoded = Buffer.from(payload.content, "base64").toString("utf8");
  return {
    data: JSON.parse(decoded),
    sha: payload.sha
  };
}

async function saveGitHubJson(token, repo, targetPath, value, message, sha = null) {
  const { owner, name } = parseRepo(repo);
  const response = await fetch(
    `${GITHUB_API_ROOT}/repos/${owner}/${name}/contents/${targetPath}`,
    {
      method: "PUT",
      headers: getHeaders(token),
      body: JSON.stringify({
        message,
        content: encodeContent(value),
        sha
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub write failed for ${targetPath}: ${response.status} ${text}`
    );
  }

  return response.json();
}

function resolveLocalPath(targetPath) {
  const directMap = {
    "pending/queue.json": DATA_PATHS.queue,
    "pending/review-memory.json": DATA_PATHS.reviewMemory,
    "pending/source-documents.json": DATA_PATHS.sourceDocuments,
    "pending/supplemental-bank.json": DATA_PATHS.supplementalBank,
    "pending/ab-experiments.json": DATA_PATHS.experiments,
    "pending/photo-bank.json": DATA_PATHS.photoBank
  };

  return (
    directMap[targetPath] ||
    path.join(path.dirname(DATA_PATHS.queue), path.basename(targetPath))
  );
}

export async function getJsonBlob({
  token = process.env.GITHUB_TOKEN,
  repo = process.env.GITHUB_REPO,
  targetPath,
  fallback
}) {
  if (token && repo) {
    return getGitHubJson(token, repo, targetPath, fallback);
  }

  const localPath = resolveLocalPath(targetPath);
  const data = await readJsonFile(localPath, fallback ?? {});
  return {
    data,
    sha: null
  };
}

export async function saveJsonBlob({
  token = process.env.GITHUB_TOKEN,
  repo = process.env.GITHUB_REPO,
  targetPath,
  value,
  sha = null,
  message = `chore(raw): update ${targetPath}`
}) {
  if (token && repo) {
    return saveGitHubJson(token, repo, targetPath, value, message, sha);
  }

  const localPath = resolveLocalPath(targetPath);
  await writeJsonFile(localPath, value);
  return { content: { path: targetPath } };
}

export async function getQueue(token, repo, targetPath = "pending/queue.json") {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: {
      generated_at: null,
      posts: []
    }
  });

  return {
    queue: data,
    sha
  };
}

export async function saveQueue(
  token,
  repo,
  queue,
  sha = null,
  targetPath = "pending/queue.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: queue,
    sha,
    message: `chore(raw): update queue ${getTodayIso()}`
  });
}

export async function getReviewMemory(
  token,
  repo,
  targetPath = "pending/review-memory.json"
) {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: {
      updated_at: null,
      approved_exemplars: [],
      rejected_patterns: [],
      review_log: []
    }
  });

  return {
    reviewMemory: data,
    sha
  };
}

export async function saveReviewMemory(
  token,
  repo,
  reviewMemory,
  sha = null,
  targetPath = "pending/review-memory.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: reviewMemory,
    sha,
    message: `chore(raw): update review memory ${getTodayIso()}`
  });
}

export async function getSourceDocuments(
  token,
  repo,
  targetPath = "pending/source-documents.json"
) {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: {
      updated_at: null,
      documents: []
    }
  });

  return {
    sourceDocuments: data,
    sha
  };
}

export async function saveSourceDocuments(
  token,
  repo,
  sourceDocuments,
  sha = null,
  targetPath = "pending/source-documents.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: sourceDocuments,
    sha,
    message: `chore(raw): update source documents ${getTodayIso()}`
  });
}

export async function getSupplementalBank(
  token,
  repo,
  targetPath = "pending/supplemental-bank.json"
) {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: {
      updated_at: null,
      items: []
    }
  });

  return {
    supplementalBank: data,
    sha
  };
}

export async function saveSupplementalBank(
  token,
  repo,
  supplementalBank,
  sha = null,
  targetPath = "pending/supplemental-bank.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: supplementalBank,
    sha,
    message: `chore(raw): update supplemental bank ${getTodayIso()}`
  });
}

export async function getExperiments(
  token,
  repo,
  targetPath = "pending/ab-experiments.json"
) {
  const { data, sha } = await getJsonBlob({
    token,
    repo,
    targetPath,
    fallback: {
      updated_at: null,
      outcomes: []
    }
  });

  return {
    experiments: data,
    sha
  };
}

export async function saveExperiments(
  token,
  repo,
  experiments,
  sha = null,
  targetPath = "pending/ab-experiments.json"
) {
  return saveJsonBlob({
    token,
    repo,
    targetPath,
    value: experiments,
    sha,
    message: `chore(raw): update experiments ${getTodayIso()}`
  });
}

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

export function getCurrentPost(queue) {
  return (
    (queue.posts || []).find((post) =>
      ["pending", "needs_revision", "publish_failed"].includes(post.status)
    ) || null
  );
}
