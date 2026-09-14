/**
 * USTAD AI — PROFILE LEADERBOARD + WEEKLY RANK REWARDS (specification).
 *
 * Pure and isomorphic: shared by the profile UI and the server engine so a
 * rule can never drift. Nothing here awards anything; it only describes the
 * categories, the Sunday-to-Sunday cycle and the deterministic ordering.
 */

export type RankCategory =
  "most_cups" | "mega" | "grandmaster" | "ultra_grandmaster" | "mystery" | "god_master" | "event";

export const RANK_CATEGORIES: readonly RankCategory[] = [
  "most_cups",
  "mega",
  "grandmaster",
  "ultra_grandmaster",
  "mystery",
  "god_master",
  "event",
];

export const CATEGORY_LABEL: Record<RankCategory, string> = {
  most_cups: "Most Cups",
  mega: "Mega Cups",
  grandmaster: "Grandmaster Cups",
  ultra_grandmaster: "Ultra Grandmaster Cups",
  mystery: "Mystery & Psychology Cups",
  god_master: "God Master Cups",
  event: "Event Cups",
};

export const CATEGORY_DESCRIPTION: Record<RankCategory, string> = {
  most_cups: "Every verified cup you own, from every USTAD competition.",
  mega: "Verified Mega Tournament victories.",
  grandmaster: "Verified Grandmaster status cups.",
  ultra_grandmaster: "Verified Ultra Great Grandmaster cups.",
  mystery: "Verified Mystery + Psychology Tournament wins.",
  god_master: "Verified USTAD GOD MASTER Tournament wins.",
  event: "Verified wins in USTAD dynamic events.",
};

/** Coins credited to Rank 1 / 2 / 3, independently in EVERY category. */
export const RANK_REWARDS = [20_000_000, 10_000_000, 5_000_000] as const;

/** How many places each category leaderboard shows. */
export const LEADERBOARD_SIZE = 20;

/** Coins for a 1-based rank; 0 for anything outside the top three. */
export function rewardForRank(rank: number): number {
  return RANK_REWARDS[rank - 1] ?? 0;
}

/** Rank 1 in a category also receives that category's own cup. */
export function cupForRank(rank: number): boolean {
  return rank === 1;
}

export const RANK_CUP_LABEL: Record<RankCategory, string> = {
  most_cups: "Weekly Champion Cup",
  mega: "Weekly Mega Rank Cup",
  grandmaster: "Weekly Grandmaster Rank Cup",
  ultra_grandmaster: "Weekly Ultra Rank Cup",
  mystery: "Weekly Mystery Rank Cup",
  god_master: "Weekly God Master Rank Cup",
  event: "Weekly Event Rank Cup",
};

/* ------------------------------------------------------------------ */
/* Sunday → Sunday cycle, in India time                                 */
/* ------------------------------------------------------------------ */

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** ISO date (YYYY-MM-DD) of the India-time day containing `at`. */
export function istDate(at: Date | string | number): string {
  const t = new Date(at).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export type RankCycle = {
  /** Sunday 00:00 IST, as YYYY-MM-DD. */
  start: string;
  /** The following Sunday, as YYYY-MM-DD (exclusive end). */
  end: string;
  /** Absolute UTC instants for range queries. */
  startIso: string;
  endIso: string;
  id: string;
};

function cycleFromSundayMs(sundayMs: number): RankCycle {
  const start = new Date(sundayMs).toISOString().slice(0, 10);
  const end = new Date(sundayMs + 7 * DAY_MS).toISOString().slice(0, 10);
  return {
    start,
    end,
    startIso: new Date(sundayMs - IST_OFFSET_MS).toISOString(),
    endIso: new Date(sundayMs + 7 * DAY_MS - IST_OFFSET_MS).toISOString(),
    id: `week:${start}`,
  };
}

/** The cycle that contains `now` (Sunday 00:00 IST → next Sunday 00:00 IST). */
export function currentCycle(now: Date | string | number = new Date()): RankCycle {
  const ist = new Date(new Date(now).getTime() + IST_OFFSET_MS);
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return cycleFromSundayMs(midnight - ist.getUTCDay() * DAY_MS);
}

export function previousCycle(cycle: RankCycle): RankCycle {
  return cycleFromSundayMs(Date.parse(`${cycle.start}T00:00:00Z`) - 7 * DAY_MS);
}

export function cycleFromStart(start: string): RankCycle {
  return cycleFromSundayMs(Date.parse(`${start}T00:00:00Z`));
}

/* ------------------------------------------------------------------ */
/* Deterministic ranking                                                */
/* ------------------------------------------------------------------ */

export type CupEvent = {
  guestId: string;
  category: RankCategory;
  /** ISO instant the cup was verified. */
  at: string;
  /** Stable identity so the same win can never be counted twice. */
  key: string;
  label: string;
  source: string;
  reference: string;
};

export type LeaderboardEntry = {
  rank: number;
  guestId: string;
  profileName: string;
  /** Verified cups earned inside the cycle — what the ranking uses. */
  cycleCups: number;
  /** All-time verified cups in this category. */
  totalCups: number;
  /** Earliest cup instant inside the cycle — the tie-breaker. */
  firstCupAt: string;
};

/**
 * Ranks players deterministically: more cups first; on a tie, whoever reached
 * the count earlier; finally the guest id, so the order is always reproducible.
 */
export function rankEntries(
  rows: Array<Omit<LeaderboardEntry, "rank">>,
  size = LEADERBOARD_SIZE,
): LeaderboardEntry[] {
  return [...rows]
    .filter((r) => r.cycleCups > 0)
    .sort(
      (a, b) =>
        b.cycleCups - a.cycleCups ||
        Date.parse(a.firstCupAt) - Date.parse(b.firstCupAt) ||
        a.guestId.localeCompare(b.guestId),
    )
    .slice(0, size)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Indian-format coin amount, e.g. 20000000 → "2,00,00,000". */
export function formatCoins(amount: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(amount));
}

/** Idempotency key for a weekly rank reward — replay-safe by construction. */
export function rankRewardRef(cycleStart: string, category: RankCategory, rank: number): string {
  return `rank:${cycleStart}:${category}:${rank}`;
}

/**
 * Deterministic identity of a weekly-rank CERTIFICATE. Backed by the unique
 * (guest_id, reference_key) index, so generating a certificate for the same
 * week + category + rank is idempotent and can never duplicate — and an old
 * week is found just like this week's (no "latest N" window).
 */
export function weeklyRankCertificateRef(
  cycleStart: string,
  category: RankCategory,
  rank: number,
): string {
  // Keep the historical reference shape (`{cycleStart}:{category}:{rank}`) that
  // existing weekly-rank certificates already store in metadata.reference, so
  // old certificates are matched exactly (never duplicated).
  return `${cycleStart}:${category}:${rank}`;
}

/**
 * One authoritative block for the USTAD AI chat context. Returns "" when the
 * user holds no rank, so the model can never invent a leaderboard position.
 */
export function rankContextLine(
  awards: Array<{ category: RankCategory; rank: number; cycleStart: string; coins: number }>,
): string {
  if (!awards.length) return "";
  const lines = awards.map(
    (a) =>
      `- Rank #${a.rank} in ${CATEGORY_LABEL[a.category]} for the week starting ${a.cycleStart} (${formatCoins(a.coins)} USTAD Coins)`,
  );
  return `USTAD AI weekly leaderboard records for this user (authoritative — never invent a rank, a name or a cup count):\n${lines.join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* Weekly reward settlement state machine (Issue: atomicity/retry)     */
/* ------------------------------------------------------------------ */

/**
 * Lifecycle of ONE weekly-rank reward row.
 *
 *   pending     → row claimed, coins not yet credited (the reward MUST NOT be
 *                 considered settled until paid).
 *   processing  → a settlement attempt has claimed the row (compare-and-set)
 *                 and is crediting coins. A concurrent attempt must skip.
 *   paid        → coins successfully credited AND audit fields written. A
 *                 repeat settlement MUST never pay again.
 *   failed      → the coin credit failed after claim; the row stays retryable.
 *
 * Only `pending` and `failed` are payable; `processing`/`paid` must never be
 * paid. This is pure so the exact-once/retry rules are unit-testable without a
 * database.
 */
export type RankRewardStatus = "pending" | "processing" | "paid" | "failed";

export const RANK_REWARD_PAYABLE: readonly RankRewardStatus[] = ["pending", "failed"];

/** True when a stored row is owed coins and may be claimed for payment. */
export function isRankRewardPayable(status: RankRewardStatus | null | undefined): boolean {
  return !!status && (status === "pending" || status === "failed");
}

/** The status a claim moves an owed row to so only ONE attempt proceeds. */
export function rankRewardClaimStatus(): Extract<RankRewardStatus, "processing"> {
  return "processing";
}

/** The persisted status that reflects whether the coin credit succeeded. */
export function rankRewardOutcomeStatus(succeeded: boolean): RankRewardStatus {
  return succeeded ? "paid" : "failed";
}

/** True once a reward is fully settled and must never be paid again. */
export function isRankRewardPaid(status: RankRewardStatus | null | undefined): boolean {
  return status === "paid";
}
