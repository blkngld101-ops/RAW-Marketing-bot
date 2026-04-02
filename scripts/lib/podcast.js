import { getTodayIso } from "./raw-core.js";
import { transcribeAudioBuffer, processClassTranscriptSource } from "./sources.js";

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  const inner = match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "");
  return cleanText(decodeEntities(inner));
}

function extractAttr(xml, tag, attr) {
  const match = xml.match(new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, "i"));
  return match ? match[1].trim() : "";
}

function parseEpisodes(rssXml) {
  const items = [...rssXml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].map(
    (match) => match[1]
  );

  return items
    .map((item) => {
      const title = extractTag(item, "title");
      const audioUrl =
        extractAttr(item, "enclosure", "url") ||
        extractAttr(item, "media:content", "url") ||
        "";
      const mimeType = extractAttr(item, "enclosure", "type") || "audio/mpeg";
      const pubDate = extractTag(item, "pubDate");
      return { title, audioUrl, mimeType, pubDate };
    })
    .filter((episode) => episode.audioUrl);
}

export async function fetchRssFeed(rssUrl) {
  const response = await fetch(rssUrl, {
    headers: { "User-Agent": "RAW Marketing Pipeline/1.0" }
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const episodes = parseEpisodes(xml);

  if (!episodes.length) {
    throw new Error("RSS feed contained no episodes with audio URLs.");
  }

  return episodes;
}

export async function downloadEpisodeAudio(episode) {
  const response = await fetch(episode.audioUrl, {
    headers: { "User-Agent": "RAW Marketing Pipeline/1.0" }
  });

  if (!response.ok) {
    throw new Error(`Episode audio download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const fileName = episode.audioUrl.split("/").pop()?.split("?")[0] || `episode-${Date.now()}.mp3`;
  const mimeType = episode.mimeType || "audio/mpeg";

  return { buffer, fileName, mimeType };
}

export async function processPodcastEpisode({
  rssUrl,
  episodeIndex = 0,
  submittedBy,
  data,
  sourceDocuments,
  supplementalBank,
  queue,
  mock = false
}) {
  const episodes = await fetchRssFeed(rssUrl);
  const episode = episodes[episodeIndex];

  if (!episode) {
    throw new Error(`Episode index ${episodeIndex} not found. Feed has ${episodes.length} episode(s).`);
  }

  const { buffer, fileName, mimeType } = await downloadEpisodeAudio(episode);
  const transcript = await transcribeAudioBuffer({ buffer, fileName, mimeType });

  return processClassTranscriptSource({
    transcriptText: transcript,
    title: episode.title || `Podcast episode ${getTodayIso()}`,
    submittedBy,
    sourceType: "podcast_episode",
    data,
    sourceDocuments,
    supplementalBank,
    queue,
    mock
  });
}

export function formatEpisodeList(episodes, limit = 5) {
  return episodes
    .slice(0, limit)
    .map((episode, index) => `${index}. ${episode.title} (${episode.pubDate || "no date"})`)
    .join("\n");
}
