import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(LIB_DIR, "../..");
export const DEFAULT_TIMEZONE =
  process.env.RAW_DEFAULT_TIMEZONE || "America/Toronto";
export const REVIEW_REASONS = [
  "too generic",
  "not RAW voice",
  "fact issue",
  "too salesy",
  "visual feels templated"
];
export const TEMPLATE_FAMILIES = [
  "craft-tip",
  "philosophy",
  "enrollment",
  "spotlight",
  "behind-the-scenes"
];

export const DATA_PATHS = {
  brandCore: path.join(ROOT_DIR, "brand-core.md"),
  contentStrategy: path.join(ROOT_DIR, "content-strategy.md"),
  offers: path.join(ROOT_DIR, "offers.json"),
  proofBank: path.join(ROOT_DIR, "proof-bank.json"),
  sessions: path.join(ROOT_DIR, "sessions.json"),
  campaigns: path.join(ROOT_DIR, "campaigns.json"),
  queue: path.join(ROOT_DIR, "pending", "queue.json"),
  reviewMemory: path.join(ROOT_DIR, "pending", "review-memory.json"),
  sourceDocuments: path.join(ROOT_DIR, "pending", "source-documents.json"),
  supplementalBank: path.join(ROOT_DIR, "pending", "supplemental-bank.json"),
  experiments: path.join(ROOT_DIR, "pending", "ab-experiments.json"),
  quoteBank: path.join(ROOT_DIR, "quote-bank.json"),
  approvedPosts: path.join(ROOT_DIR, "approved-posts"),
  templates: path.join(ROOT_DIR, "templates")
};

const PUBLISHING_WEEKDAYS = [2, 4, 6];
const PILLAR_BY_WEEKDAY = {
  2: "craft",
  4: "philosophy",
  6: "conversion"
};
export const WEEKDAY_BY_PILLAR = {
  craft: 2,
  philosophy: 4,
  conversion: 6
};

const CRAFT_ANGLES = [
  {
    id: "cold-read-first-pass",
    label: "FIRST PASS",
    template_family: "craft-tip",
    acting_concept: "cold reads",
    acting_keywords: ["cold read", "first pass", "sides", "choice"],
    problem: "Actors often burn time trying to feel everything before making a first pass.",
    tool: "Make one playable choice before you chase emotional polish.",
    proof_sources: ["repeatable-system", "audition-practical-system"]
  },
  {
    id: "playable-actions",
    label: "PLAYABLE ACTION",
    template_family: "craft-tip",
    acting_concept: "playable actions",
    acting_keywords: ["action", "objective", "playable", "partner"],
    problem: "Vague emotional goals flatten work on camera.",
    tool: "Swap feelings language for an action you can actually do to the other person.",
    proof_sources: ["action-intention-purpose", "industry-reality"]
  },
  {
    id: "taking-direction-fast",
    label: "TAKING DIRECTION",
    template_family: "craft-tip",
    acting_concept: "taking direction",
    acting_keywords: ["direction", "adjustment", "specificity", "audition"],
    problem: "Many actors hear an adjustment but do not know how to translate it into behavior fast enough.",
    tool: "Translate direction into a playable change, not a mood.",
    proof_sources: ["industry-reality", "serious-supportive"]
  },
  {
    id: "self-tape-under-pressure",
    label: "SELF-TAPE",
    template_family: "craft-tip",
    acting_concept: "self-tape prep",
    acting_keywords: ["self-tape", "prep", "audition", "pressure"],
    problem: "Actors lose clarity when a self-tape deadline collapses preparation time.",
    tool: "Shrink the work into essentials: circumstances, objective, action, frame.",
    proof_sources: ["industry-reality", "audition-practical-system"]
  },
  {
    id: "script-analysis-no-overthinking",
    label: "SCRIPT ANALYSIS",
    template_family: "craft-tip",
    acting_concept: "script analysis",
    acting_keywords: ["script analysis", "scene", "beat", "given circumstances"],
    problem: "Over-analysis makes work sound smart but feel dead.",
    tool: "Pull only the facts that change behavior in the scene.",
    proof_sources: ["repeatable-system", "master-repeat-taking"]
  },
  {
    id: "specificity-beats",
    label: "SPECIFICITY",
    template_family: "craft-tip",
    acting_concept: "specificity in choices",
    acting_keywords: ["specificity", "beat", "choice", "scene"],
    problem: "General choices read as effort instead of truth.",
    tool: "Find the exact beat where the need shifts and let the behavior answer it.",
    proof_sources: ["repeatable-system", "serious-supportive"]
  }
];

const PHILOSOPHY_ANGLES = [
  {
    id: "authorship-over-guessing",
    label: "AUTHORSHIP",
    template_family: "philosophy",
    acting_concept: "authorship",
    acting_keywords: ["authorship", "choices", "process", "clarity"],
    problem: "Actors often mistake activity for ownership.",
    tool: "RAW pushes actors to understand why they are doing something and be able to repeat it.",
    proof_sources: ["repeatable-system", "action-intention-purpose"]
  },
  {
    id: "clarity-is-kindness",
    label: "CLARITY",
    template_family: "philosophy",
    acting_concept: "clarity",
    acting_keywords: ["clarity", "tool", "repeatable", "coaching"],
    problem: "Vague feedback wastes time and keeps actors guessing.",
    tool: "Specific language gives actors something they can use again.",
    proof_sources: ["repeatable-system", "serious-supportive"]
  },
  {
    id: "serious-supportive-room",
    label: "THE ROOM",
    template_family: "philosophy",
    acting_concept: "serious support",
    acting_keywords: ["supportive", "challenge", "room", "craft"],
    problem: "Many actors have to choose between softness and rigor when they should not have to.",
    tool: "RAW positions challenge and support as part of the same room.",
    proof_sources: ["serious-supportive", "testimonial-artist-seen"]
  },
  {
    id: "all-levels-genuinely-welcome",
    label: "ALL LEVELS",
    template_family: "philosophy",
    acting_concept: "respect for all levels",
    acting_keywords: ["all levels", "respect", "process", "growth"],
    problem: "Beginners get talked down to and experienced actors get generic notes.",
    tool: "Meet the actor where they are, then raise the level of the work.",
    proof_sources: ["serious-supportive", "testimonial-tools-practical"]
  },
  {
    id: "lineage-meets-now",
    label: "LINEAGE",
    template_family: "philosophy",
    acting_concept: "lineage-based contemporary teaching",
    acting_keywords: ["lineage", "technique", "contemporary", "camera"],
    problem: "Technique language can become either museum talk or trend talk.",
    tool: "RAW ties lineage to modern audition and on-camera realities.",
    proof_sources: ["industry-reality", "lineage-based-teaching"]
  },
  {
    id: "acting-is-a-job",
    label: "INDUSTRY REALITY",
    template_family: "philosophy",
    acting_concept: "professional standards",
    acting_keywords: ["industry", "professional", "on set", "pressure"],
    problem: "The room should prepare actors for actual standards, not fantasy conditions.",
    tool: "Training has to work when time is short and the pressure is real.",
    proof_sources: ["industry-reality", "repeatable-system"]
  }
];

const CONVERSION_ANGLES = [
  {
    id: "audit-gap-check",
    label: "FREE AUDIT",
    template_family: "enrollment",
    acting_concept: "audit",
    acting_keywords: ["audit", "self-tape", "casting", "pressure"],
    problem: "Many actors do not know where their process breaks down until someone tests it in real conditions.",
    tool: "Use the free audit as a clear snapshot of what is working and what is not.",
    cta_type: "audit",
    offer_id: "free-audit",
    proof_sources: ["audit-functional-snapshot", "testimonial-tools-practical"]
  },
  {
    id: "master-class-system",
    label: "THE MASTER CLASS",
    template_family: "enrollment",
    acting_concept: "scene prep",
    acting_keywords: ["scene", "prep", "repeatable", "craft"],
    problem: "Actors need a room where process can be practiced until it holds up repeatedly.",
    tool: "The Master Class turns process into something you can actually repeat with new material.",
    cta_type: "enrollment",
    offer_id: "master-class",
    proof_sources: ["master-repeat-taking", "repeatable-system"]
  },
  {
    id: "audition-class-system",
    label: "ON-CAMERA AUDITION",
    template_family: "enrollment",
    acting_concept: "audition process",
    acting_keywords: ["audition", "on camera", "sides", "prep"],
    problem: "Actors want stronger audition results but often lack a process they can trust.",
    tool: "RAW frames audition work as a practical system, not a confidence exercise.",
    cta_type: "enrollment",
    offer_id: "on-camera-audition",
    proof_sources: ["audition-practical-system", "industry-reality"]
  },
  {
    id: "reels-proof-of-work",
    label: "RAW REELS",
    template_family: "spotlight",
    acting_concept: "proof-of-work",
    acting_keywords: ["reels", "footage", "range", "casting"],
    problem: "Sometimes the next move is not another abstract tip. It is better proof of what you can do.",
    tool: "Use footage that shows range, type, and on-camera truth clearly.",
    cta_type: "reels",
    offer_id: "raw-reels",
    proof_sources: ["reels-proof-of-work", "bookings-logos"]
  },
  {
    id: "student-proof-room",
    label: "IN THE ROOM",
    template_family: "behind-the-scenes",
    acting_concept: "room culture",
    acting_keywords: ["room", "class", "support", "practice"],
    problem: "Actors do not just buy a syllabus. They buy the room, the standards, and the feedback quality.",
    tool: "Show how RAW works in practice, not just what it promises.",
    cta_type: "proof",
    offer_id: "free-audit",
    proof_sources: ["testimonial-artist-seen", "serious-supportive"]
  },
  {
    id: "student-returns-to-master",
    label: "STUDENT SPOTLIGHT",
    template_family: "spotlight",
    acting_concept: "repeat training",
    acting_keywords: ["master class", "repeat", "craft", "growth"],
    problem: "Actors often think good training is something you finish once.",
    tool: "Show why serious actors come back to sharpen the process again.",
    cta_type: "proof",
    offer_id: "master-class",
    proof_sources: ["master-repeat-taking", "testimonial-unique-setting"]
  }
];

export const ANGLE_LIBRARY = {
  craft: CRAFT_ANGLES,
  philosophy: PHILOSOPHY_ANGLES,
  conversion: CONVERSION_ANGLES
};

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonFile(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readTextFile(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstSentence(value) {
  return (
    String(value || "")
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find(Boolean) || ""
  );
}

export function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

export function wordCount(value) {
  return normalizeText(value).split(" ").filter(Boolean).length;
}

export function getTodayIso(timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function addDays(isoDate, amount) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getJsWeekday(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function buildPublishingSlots({
  count,
  startDate = getTodayIso(DEFAULT_TIMEZONE)
}) {
  const slots = [];
  let offset = 0;

  while (slots.length < count && offset < 90) {
    const date = addDays(startDate, offset);
    const weekday = getJsWeekday(date);
    if (PUBLISHING_WEEKDAYS.includes(weekday)) {
      slots.push({
        date,
        weekday,
        pillar: PILLAR_BY_WEEKDAY[weekday]
      });
    }
    offset += 1;
  }

  return slots;
}

export function flattenProofBank(proofBank) {
  const entries = [
    ...(proofBank.brand_pillars || []),
    ...(proofBank.faculty || []),
    ...(proofBank.social_proof || []),
    ...(proofBank.offer_proof || [])
  ];

  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function mapOffersById(offersData) {
  return new Map((offersData.offers || []).map((offer) => [offer.id, offer]));
}

export async function loadProjectData() {
  const [
    brandCore,
    contentStrategy,
    offers,
    proofBank,
    sessions,
    campaigns,
    queue,
    reviewMemory,
    sourceDocuments,
    supplementalBank,
    quoteBank
  ] = await Promise.all([
    readTextFile(DATA_PATHS.brandCore),
    readTextFile(DATA_PATHS.contentStrategy),
    readJsonFile(DATA_PATHS.offers, {}),
    readJsonFile(DATA_PATHS.proofBank, {}),
    readJsonFile(DATA_PATHS.sessions, []),
    readJsonFile(DATA_PATHS.campaigns, []),
    readJsonFile(DATA_PATHS.queue, { generated_at: null, posts: [] }),
    readJsonFile(DATA_PATHS.reviewMemory, {
      updated_at: null,
      approved_exemplars: [],
      rejected_patterns: [],
      review_log: []
    }),
    readJsonFile(DATA_PATHS.sourceDocuments, {
      updated_at: null,
      documents: []
    }),
    readJsonFile(DATA_PATHS.supplementalBank, {
      updated_at: null,
      items: []
    }),
    readJsonFile(DATA_PATHS.quoteBank, [])
  ]);

  return {
    brandCore,
    contentStrategy,
    offers,
    proofBank,
    sessions,
    campaigns,
    queue,
    reviewMemory,
    sourceDocuments,
    supplementalBank,
    quoteBank,
    offersById: mapOffersById(offers),
    proofById: flattenProofBank(proofBank)
  };
}

export function getRecentContent(queue, reviewMemory, limit = 12) {
  const queuePosts = [...(queue.posts || [])]
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))
    .slice(0, limit)
    .map((post) => ({
      headline: post.headline,
      angle_id: post.angle_id,
      opening: firstSentence(post.caption),
      type: post.type
    }));

  const exemplars = (reviewMemory.approved_exemplars || [])
    .slice(-limit)
    .map((entry) => ({
      headline: entry.headline,
      angle_id: entry.angle_id,
      opening: firstSentence(entry.caption),
      type: entry.type
    }));

  return [...queuePosts, ...exemplars].slice(0, limit);
}

function resolveLocationAllowed(offersData) {
  return offersData?.offers?.location?.verification_status === "verified";
}

export function resolveActiveSession(
  sessions,
  todayIso = getTodayIso(DEFAULT_TIMEZONE)
) {
  const candidates = [...(sessions || [])]
    .filter((session) => session && (session.start_date || session.urgency_stage))
    .sort((left, right) =>
      String(left.start_date || "9999-12-31").localeCompare(
        String(right.start_date || "9999-12-31")
      )
    );

  return (
    candidates.find((session) => {
      if (session.urgency_stage && session.urgency_stage !== "awareness") {
        return true;
      }

      if (!session.enrollment_open || !session.start_date) {
        return false;
      }

      return todayIso >= session.enrollment_open && todayIso <= session.start_date;
    }) || null
  );
}

function pickFirstUnused(angles, recentAngleIds) {
  const fresh = angles.find((angle) => !recentAngleIds.has(angle.id));
  return fresh || angles[0];
}

function chooseConversionAngle({
  activeSession,
  recentAngleIds,
  conversionIndex
}) {
  if (activeSession && conversionIndex === 0) {
    const sessionOfferId = activeSession.offer_id || "master-class";
    const enrollmentAngle =
      CONVERSION_ANGLES.find(
        (angle) => angle.offer_id === sessionOfferId && angle.cta_type === "enrollment"
      ) || CONVERSION_ANGLES.find((angle) => angle.cta_type === "enrollment");

    if (enrollmentAngle) {
      return enrollmentAngle;
    }
  }

  const preferredOrder = [
    "audit-gap-check",
    "student-proof-room",
    "reels-proof-of-work",
    "student-returns-to-master",
    "master-class-system",
    "audition-class-system"
  ];

  for (const id of preferredOrder) {
    if (!recentAngleIds.has(id)) {
      return CONVERSION_ANGLES.find((angle) => angle.id === id);
    }
  }

  return CONVERSION_ANGLES[0];
}

export function buildAngleBriefs({
  slots,
  recentContent,
  activeSession,
  offersData,
  proofById
}) {
  const recentAngleIds = new Set(
    (recentContent || []).map((item) => item.angle_id).filter(Boolean)
  );

  let conversionIndex = 0;

  return slots.map((slot) => {
    const pool = ANGLE_LIBRARY[slot.pillar];
    const selected =
      slot.pillar === "conversion"
        ? chooseConversionAngle({
            activeSession,
            recentAngleIds,
            conversionIndex
          })
        : pickFirstUnused(pool, recentAngleIds);

    recentAngleIds.add(selected.id);

    if (slot.pillar === "conversion") {
      conversionIndex += 1;
    }

    const offer =
      selected.offer_id && offersData?.offersById
        ? offersData.offersById.get(selected.offer_id)
        : null;

    const proofEntries = (selected.proof_sources || [])
      .map((id) => proofById.get(id))
      .filter(Boolean);

    return {
      angle_id: selected.id,
      date: slot.date,
      pillar: slot.pillar,
      weekday: slot.weekday,
      type: selected.template_family,
      label: selected.label,
      acting_concept: selected.acting_concept,
      acting_keywords: selected.acting_keywords,
      problem: selected.problem,
      tool: selected.tool,
      cta_type: selected.cta_type || (slot.pillar === "conversion" ? "proof" : "soft"),
      offer_id: selected.offer_id || null,
      cta_url: offer?.cta_url || null,
      audience_stage:
        slot.pillar === "craft" ? "cold" : slot.pillar === "philosophy" ? "warm" : "hot",
      proof_sources: selected.proof_sources || [],
      source_notes: proofEntries.map((entry) => entry.summary || entry.label || entry.name),
      offer_snapshot: offer,
      active_session: activeSession,
      allow_location_copy: resolveLocationAllowed(offersData)
    };
  });
}

export function dedupeHashtags(hashtags) {
  const seen = new Set();
  const output = [];

  for (const tag of hashtags || []) {
    const normalized = tag.startsWith("#") ? tag : `#${tag}`;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      output.push(normalized);
    }
  }

  return output;
}

export function getLastQueuedDate(queue) {
  const dates = (queue.posts || []).map((post) => post.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export function nextScheduleStartDate(queue) {
  const lastDate = getLastQueuedDate(queue);
  if (!lastDate) {
    return getTodayIso(DEFAULT_TIMEZONE);
  }
  return addDays(lastDate, 1);
}

export function getQueueDepth(queue) {
  return (queue.posts || []).filter((post) =>
    ["pending", "needs_revision", "approved"].includes(post.status)
  ).length;
}

export function buildPostFilename(post) {
  return `${post.date}-${slugify(post.headline || post.angle_id || post.type)}.png`;
}

export function createId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}

export function uniqueBy(items, selector) {
  const seen = new Set();
  const output = [];

  for (const item of items || []) {
    const key = selector(item);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(item);
    }
  }

  return output;
}

export function allocateDatesForPillars(queue, pillars) {
  const allocated = [];
  const usedDates = new Set((queue.posts || []).map((post) => post.date).filter(Boolean));
  let cursor = nextScheduleStartDate(queue);
  let guard = 0;

  for (const pillar of pillars) {
    const targetWeekday = WEEKDAY_BY_PILLAR[pillar] || 6;
    while (guard < 365) {
      const weekday = getJsWeekday(cursor);
      if (weekday === targetWeekday && !usedDates.has(cursor)) {
        allocated.push(cursor);
        usedDates.add(cursor);
        cursor = addDays(cursor, 1);
        break;
      }
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }

  return allocated;
}
