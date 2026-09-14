/**
 * USTAD AI — PROFILE LEADERBOARD + WEEKLY RANK SETTLEMENT (server authority).
 *
 * REUSES, never rebuilds:
 *   • guest identity / db()  → `guest.server.ts`
 *   • verified cups          → `ustad_achievements`, `tournament_attempts`,
 *                              `master_event_results`
 *   • coins                  → `wallet.server.ts` (`applyCoins`, idempotent)
 *   • certificates           → `certificate-engine.server.ts`
 *   • notifications          → `notification.server.ts`
 *   • profile names          → existing `profiles` table
 *
 * HARD RULES
 *   1. Every count comes from a verified backend record. Nothing is invented.
 *   2. A finished cycle settles exactly once (`ustad_rank_cycles`), and each
 *      award row is unique per (cycle, category, guest), so a retry, a refresh
 *      or two concurrent readers can never pay twice.
 *   3. Settlement is immutable: a settled cycle is never recomputed.
 */

import { db } from "./guest.server";
import { applyCoins } from "./wallet.server";
import { notifyGuest } from "./notification.server";
import { issueStandaloneCertificate } from "./certificate-engine.server";
import { recipientDisplayName } from "./certificate-spec";
import {
  CATEGORY_LABEL,
  LEADERBOARD_SIZE,
  RANK_CATEGORIES,
  RANK_CUP_LABEL,
  currentCycle,
  cupForRank,
  cycleFromStart,
  formatCoins,
  previousCycle,
  RANK_REWARD_PAYABLE,
  istDate,
  isRankRewardPaid,
  isRankRewardPayable,
  rankContextLine,
  rankEntries,
  rankRewardClaimStatus,
  rankRewardOutcomeStatus,
  rankRewardRef,
  rewardForRank,
  weeklyRankCertificateRef,
  type CupEvent,
  type LeaderboardEntry,
  type RankCategory,
  type RankCycle,
  type RankRewardStatus,
} from "./rank-spec";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const sdb = () => db() as any;

/* ------------------------------------------------------------------ */
/* Verified cup collection                                              */
/* ------------------------------------------------------------------ */

const ACHIEVEMENT_CATEGORY: Record<string, RankCategory | null> = {
  normal_cup: null, // counts only toward Most Cups
  mega_cup: "mega",
  grandmaster: "grandmaster",
  ultra_grandmaster: "ultra_grandmaster",
};

const ACHIEVEMENT_LABEL: Record<string, string> = {
  normal_cup: "Tournament Cup",
  mega_cup: "Mega Tournament Cup",
  grandmaster: "Grandmaster Cup",
  ultra_grandmaster: "Ultra Great Grandmaster Cup",
};

/**
 * Every verified cup in the system, as flat events. Each event carries the
 * category it belongs to; Most Cups is the union of all of them.
 */
async function collectCupEvents(guestId?: string): Promise<CupEvent[]> {
  const events: CupEvent[] = [];
  const seen = new Set<string>();
  const push = (e: CupEvent) => {
    if (seen.has(e.key)) return;
    seen.add(e.key);
    events.push(e);
  };

  try {
    let q = sdb()
      .from("ustad_achievements")
      .select("id,guest_id,type,event_id,match_id,awarded_at,verification_status")
      .eq("verification_status", "verified");
    if (guestId) q = q.eq("guest_id", guestId);
    for (const r of ((await q).data ?? []) as Row[]) {
      const type = String(r["type"]);
      if (!(type in ACHIEVEMENT_CATEGORY)) continue;
      const category = ACHIEVEMENT_CATEGORY[type];
      push({
        guestId: String(r["guest_id"]),
        category: (category ?? "most_cups") as RankCategory,
        at: String(r["awarded_at"] ?? r["created_at"] ?? new Date().toISOString()),
        key: `ach:${r["guest_id"]}:${type}:${r["event_id"] ?? "-"}:${r["match_id"] ?? r["id"]}`,
        label: ACHIEVEMENT_LABEL[type] ?? "USTAD Cup",
        source: "Achievement record",
        reference: String(r["id"]),
      });
    }
  } catch {
    /* a missing table must never blank the whole leaderboard */
  }

  try {
    let q = sdb()
      .from("tournament_attempts")
      .select("id,guest_id,kind,result,cycle_id,completed_at,created_at")
      .eq("result", "won");
    if (guestId) q = q.eq("guest_id", guestId);
    for (const r of ((await q).data ?? []) as Row[]) {
      const kind = String(r["kind"]);
      const category: RankCategory | null =
        kind === "mystery" ? "mystery" : kind === "god" ? "god_master" : null;
      if (!category) continue;
      push({
        guestId: String(r["guest_id"]),
        category,
        at: String(r["completed_at"] ?? r["created_at"]),
        key: `tour:${r["id"]}`,
        label: category === "mystery" ? "Mystery + Psychology Cup" : "USTAD GOD MASTER Cup",
        source: category === "mystery" ? "Mystery Tournament" : "God Master Tournament",
        reference: String(r["cycle_id"] ?? r["id"]),
      });
    }
  } catch {
    /* ignore */
  }

  try {
    let q = sdb()
      .from("master_event_results")
      .select("id,guest_id,event_id,is_winner,created_at")
      .eq("is_winner", true);
    if (guestId) q = q.eq("guest_id", guestId);
    for (const r of ((await q).data ?? []) as Row[]) {
      push({
        guestId: String(r["guest_id"]),
        category: "event",
        at: String(r["created_at"]),
        key: `event:${r["id"]}`,
        label: "USTAD Event Cup",
        source: "USTAD Event",
        reference: String(r["event_id"]),
      });
    }
  } catch {
    /* ignore */
  }

  return events;
}

function inCycle(e: CupEvent, cycle: RankCycle): boolean {
  const t = Date.parse(e.at);
  return Number.isFinite(t) && t >= Date.parse(cycle.startIso) && t < Date.parse(cycle.endIso);
}

function matches(e: CupEvent, category: RankCategory): boolean {
  return category === "most_cups" ? true : e.category === category;
}

async function profileNames(guestIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!guestIds.length) return out;
  try {
    const { data } = await sdb().from("profiles").select("guest_id,name").in("guest_id", guestIds);
    for (const r of (data ?? []) as Row[]) {
      out[String(r["guest_id"])] = recipientDisplayName({ name: r["name"] });
    }
  } catch {
    /* fall through to the neutral label below */
  }
  for (const id of guestIds) out[id] ??= recipientDisplayName({});
  return out;
}

/** Top-N table for one category and one cycle, from verified records only. */
function buildBoard(
  events: CupEvent[],
  category: RankCategory,
  cycle: RankCycle,
): Array<Omit<LeaderboardEntry, "rank" | "profileName">> {
  const acc = new Map<string, { cycleCups: number; totalCups: number; firstCupAt: string }>();
  for (const e of events) {
    if (!matches(e, category)) continue;
    const row = acc.get(e.guestId) ?? {
      cycleCups: 0,
      totalCups: 0,
      firstCupAt: "9999-12-31T00:00:00.000Z",
    };
    row.totalCups += 1;
    if (inCycle(e, cycle)) {
      row.cycleCups += 1;
      if (Date.parse(e.at) < Date.parse(row.firstCupAt)) row.firstCupAt = e.at;
    }
    acc.set(e.guestId, row);
  }
  return [...acc.entries()].map(([guestId, v]) => ({ guestId, ...v }));
}

/* ------------------------------------------------------------------ */
/* Public reads                                                         */
/* ------------------------------------------------------------------ */

export type CategoryBoard = {
  category: RankCategory;
  label: string;
  entries: LeaderboardEntry[];
  /** This user's live position, even when outside the top 20. */
  you: LeaderboardEntry | null;
};

export type LeaderboardView = {
  cycle: { start: string; end: string; id: string };
  boards: CategoryBoard[];
  /** Settled weekly rank awards this user holds. */
  myAwards: RankAwardView[];
};

export type RankAwardView = {
  cycleStart: string;
  cycleEnd: string;
  category: RankCategory;
  categoryLabel: string;
  rank: number;
  cupCount: number;
  coins: number;
  cupAwarded: boolean;
  cupLabel: string | null;
  certificateId: string | null;
};

export type CupDetail = {
  key: string;
  label: string;
  category: RankCategory;
  categoryLabel: string;
  source: string;
  reference: string;
  awardedAt: string;
  cycleStart: string;
};

export async function getLeaderboard(guestId: string): Promise<LeaderboardView> {
  await settleDueCycles();
  const cycle = currentCycle();
  const events = await collectCupEvents();
  const boards: CategoryBoard[] = [];

  const ids = new Set<string>();
  const raw = new Map<RankCategory, Array<Omit<LeaderboardEntry, "rank" | "profileName">>>();
  for (const category of RANK_CATEGORIES) {
    const rows = buildBoard(events, category, cycle);
    raw.set(category, rows);
    for (const r of rows) if (r.cycleCups > 0) ids.add(r.guestId);
  }
  ids.add(guestId);
  const names = await profileNames([...ids]);

  for (const category of RANK_CATEGORIES) {
    const rows = (raw.get(category) ?? []).map((r) => ({
      ...r,
      profileName: names[r.guestId] ?? recipientDisplayName({}),
    }));
    // Rank the full field, then cut to the visible size, so "you" is truthful.
    const full = rankEntries(rows, Number.MAX_SAFE_INTEGER);
    const mine = full.find((r) => r.guestId === guestId) ?? null;
    boards.push({
      category,
      label: CATEGORY_LABEL[category],
      entries: full.slice(0, LEADERBOARD_SIZE),
      you: mine,
    });
  }

  return {
    cycle: { start: cycle.start, end: cycle.end, id: cycle.id },
    boards,
    myAwards: await listRankAwards(guestId),
  };
}

/** Every verified cup this user owns, with its full provenance. */
export async function getAllCups(guestId: string): Promise<CupDetail[]> {
  const events = await collectCupEvents(guestId);
  return events
    .filter((e) => e.guestId === guestId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((e) => ({
      key: e.key,
      label: e.label,
      category: e.category,
      categoryLabel: CATEGORY_LABEL[e.category],
      source: e.source,
      reference: e.reference,
      awardedAt: e.at,
      cycleStart: currentCycle(e.at).start,
    }));
}

export async function listRankAwards(guestId: string): Promise<RankAwardView[]> {
  try {
    const { data } = await sdb()
      .from("ustad_rank_awards")
      .select("*")
      .eq("guest_id", guestId)
      .order("cycle_start", { ascending: false });
    return ((data ?? []) as Row[]).map((r) => {
      const category = String(r["category"]) as RankCategory;
      return {
        cycleStart: String(r["cycle_start"]),
        cycleEnd: String(r["cycle_end"]),
        category,
        categoryLabel: CATEGORY_LABEL[category] ?? category,
        rank: Number(r["rank"]),
        cupCount: Number(r["cup_count"] ?? 0),
        coins: Number(r["coins"] ?? 0),
        cupAwarded: r["cup_awarded"] === true,
        cupLabel: r["cup_awarded"] === true ? (RANK_CUP_LABEL[category] ?? null) : null,
        certificateId: (r["certificate_id"] as string) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Weekly settlement (immutable, idempotent)                            */
/* ------------------------------------------------------------------ */

async function isSettled(cycle: RankCycle): Promise<boolean> {
  try {
    const { data } = await sdb()
      .from("ustad_rank_cycles")
      .select("cycle_start")
      .eq("cycle_start", cycle.start)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return true; // never risk paying twice when the check itself failed
  }
}

/**
 * Settle every finished cycle that has not been settled yet (bounded look-back
 * so a long-idle app never replays months of history), then reconcile any
 * award rows that were claimed but whose coin credit never landed (pending /
 * failed, and stale processing) — so a transient coin-credit failure is
 * retried instead of silently losing the reward.
 */
export async function settleDueCycles(now: Date = new Date()): Promise<string[]> {
  const settled: string[] = [];
  let cycle = previousCycle(currentCycle(now));
  for (let i = 0; i < 4; i++) {
    if (await settleCycle(cycle)) settled.push(cycle.start);
    cycle = previousCycle(cycle);
  }
  await reconcileUnpaidAwards(now);
  return settled;
}

/**
 * Retry rewards that were never actually paid. A row is owed coins when:
 *   • its status is `pending` or `failed`, or
 *   • it is `processing` but stale (a process crashed between claim and the
 *     coin credit) — those are downgraded to `failed` so they become payable.
 * Only ended cycles are considered (a running cycle must never be paid).
 */
async function reconcileUnpaidAwards(now: Date = new Date()): Promise<void> {
  try {
    const staleCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    // Recover crashed `processing` rows first.
    await sdb()
      .from("ustad_rank_awards")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", staleCutoff);

    const { data } = await sdb()
      .from("ustad_rank_awards")
      .select("*")
      .in("status", ["pending", "failed"])
      .lt("cycle_end", istDate(now))
      .limit(200);
    const rows = (data as Row[]) ?? [];
    for (const row of rows) {
      const cycle = cycleFromStart(String(row["cycle_start"]));
      const entry: LeaderboardEntry = {
        rank: Number(row["rank"]),
        guestId: String(row["guest_id"]),
        profileName: String(row["profile_name"] ?? ""),
        cycleCups: Number(row["cup_count"] ?? 0),
        totalCups: Number(row["cup_count"] ?? 0),
        firstCupAt: "",
      };
      await settleRankAward(cycle, row["category"] as RankCategory, entry, {
        coins: Number(row["coins"] ?? rewardForRank(entry.rank)),
      });
    }
  } catch {
    /* reconciliation is best-effort; the next read/settle retries it */
  }
}

/** Settle ONE finished cycle. Returns true when this call did the settling. */
export async function settleCycle(cycle: RankCycle): Promise<boolean> {
  if (Date.now() < Date.parse(cycle.endIso)) return false; // still running
  if (await isSettled(cycle)) return false;

  const events = await collectCupEvents();
  const summary: Row = {};

  for (const category of RANK_CATEGORIES) {
    const rows = buildBoard(events, category, cycle);
    const names = await profileNames(rows.filter((r) => r.cycleCups > 0).map((r) => r.guestId));
    const top = rankEntries(
      rows.map((r) => ({ ...r, profileName: names[r.guestId] ?? recipientDisplayName({}) })),
      3,
    );
    summary[category] = top.map((t) => ({ rank: t.rank, guestId: t.guestId, cups: t.cycleCups }));
    for (const entry of top) await settleRankAward(cycle, category, entry);
  }

  try {
    await sdb()
      .from("ustad_rank_cycles")
      .insert({ cycle_start: cycle.start, cycle_end: cycle.end, summary });
  } catch {
    /* a concurrent settler already recorded it — awards are unique anyway */
  }
  return true;
}

async function awardRow(
  cycle: RankCycle,
  category: RankCategory,
  guestId: string,
): Promise<Row | null> {
  const { data } = await sdb()
    .from("ustad_rank_awards")
    .select("*")
    .eq("cycle_start", cycle.start)
    .eq("category", category)
    .eq("guest_id", guestId)
    .maybeSingle();
  return (data as Row) ?? null;
}

/**
 * Compare-and-set a payable award row to `processing`. Only the caller whose
 * UPDATE matches a row that is still `pending`/`failed` proceeds to credit
 * coins — so two concurrent settlements can never both pay, and a row that is
 * already `paid` (or currently being processed by someone else) is skipped.
 */
async function claimAwardForPayment(row: Row): Promise<boolean> {
  const { data } = await sdb()
    .from("ustad_rank_awards")
    .update({ status: rankRewardClaimStatus(), updated_at: new Date().toISOString() })
    .eq("id", row["id"])
    .in("status", RANK_REWARD_PAYABLE)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

async function markAward(row: Row, status: RankRewardStatus, patch: Row): Promise<void> {
  try {
    await sdb()
      .from("ustad_rank_awards")
      .update({ status, updated_at: new Date().toISOString(), ...patch })
      .eq("id", row["id"]);
  } catch {
    /* bookkeeping only — never throws into a settlement loop */
  }
}

async function issueRankCertificate(input: {
  guestId: string;
  cycle: RankCycle;
  category: RankCategory;
  rank: number;
  cycleCups: number;
  coins: number;
}): Promise<string | null> {
  try {
    const cert = await issueStandaloneCertificate({
      guestId: input.guestId,
      type: "weekly_rank",
      reference: weeklyRankCertificateRef(input.cycle.start, input.category, input.rank),
      awardTitle: `Weekly Rank #${input.rank} — ${CATEGORY_LABEL[input.category]}`,
      eventName: `USTAD Weekly Leaderboard (${input.cycle.start} → ${input.cycle.end})`,
      tournament: "USTAD AI Weekly Leaderboard",
      facts: [
        { label: "Category", value: CATEGORY_LABEL[input.category] },
        { label: "Rank", value: `#${input.rank}` },
        { label: "Verified Cups", value: String(input.cycleCups) },
        { label: "Reward", value: `${formatCoins(input.coins)} USTAD Coins` },
      ],
    });
    return cert;
  } catch {
    /* certificate failure must never void the settled rank */
    return null;
  }
}

/**
 * Ensure ONE weekly rank reward is fully paid — safely retryable.
 *
 * Idempotency model (Issue: rank reward can be lost / double-paid):
 *   • The award row is the claim. `pending`/`failed` → payable; `paid` → done
 *     forever; `processing` → another attempt owns it.
 *   • Coins are credited ONLY by the attempt that wins the CAS claim, and the
 *     credit itself is replay-safe at the ledger (rankRewardRef), so a lost
 *     credit can never be silently skipped and a paid one can never be paid
 *     twice.
 *   • On success the row moves to `paid` with its transaction id + certificate.
 *   • On failure the row moves to `failed` and stays retryable.
 *
 * A notification is raised only on the pending→paid transition.
 */
async function settleRankAward(
  cycle: RankCycle,
  category: RankCategory,
  entry: LeaderboardEntry,
  opts: { coins?: number } = {},
): Promise<void> {
  const coins = opts.coins ?? rewardForRank(entry.rank);
  if (coins <= 0) return;

  // 1. Ensure the award row exists (unique index is the row-level guard).
  let row = await awardRow(cycle, category, entry.guestId);
  if (!row) {
    const { data: inserted, error } = await sdb()
      .from("ustad_rank_awards")
      .insert({
        cycle_start: cycle.start,
        cycle_end: cycle.end,
        category,
        guest_id: entry.guestId,
        profile_name: entry.profileName,
        rank: entry.rank,
        cup_count: entry.cycleCups,
        coins,
        cup_awarded: cupForRank(entry.rank),
        status: "pending",
      })
      .select()
      .maybeSingle();
    if (error || !inserted) {
      // A concurrent settler already inserted it — reload it.
      row = await awardRow(cycle, category, entry.guestId);
      if (!row) return;
    } else {
      row = inserted as Row;
    }
  }

  const status = String(row["status"] ?? "pending") as RankRewardStatus;

  // 2. Already fully paid — never pay again.
  if (isRankRewardPaid(status)) {
    // Ensure the certificate exists even if a prior run paid but crashed before
    // issuing it (idempotent by reference).
    const cert = await issueRankCertificate({
      guestId: entry.guestId,
      cycle,
      category,
      rank: entry.rank,
      cycleCups: Number(row["cup_count"] ?? entry.cycleCups),
      coins,
    });
    if (cert && !row["certificate_id"]) {
      await markAward(row, "paid", { certificate_id: cert });
    }
    return;
  }

  // 3. Not payable (someone else is processing) → skip this round.
  if (!isRankRewardPayable(status)) return;

  // 4. Claim: pending|failed → processing. Losing the race means someone else
  //    is already paying this reward right now — do nothing.
  if (!(await claimAwardForPayment(row))) return;

  // 5. Credit coins (replay-safe at the ledger).
  let transactionId: string | null = null;
  let paid = false;
  try {
    const res = await applyCoins({
      guestId: entry.guestId,
      source: "rank_reward",
      refId: rankRewardRef(cycle.start, category, entry.rank),
      amount: coins,
      type: "weekly_rank",
      note: `Weekly Rank #${entry.rank} — ${CATEGORY_LABEL[category]}`,
    });
    transactionId = res.transactionId;
    paid = true;
  } catch {
    /* credit failed → mark failed, keep retryable, never claim success */
  }

  if (!paid) {
    await markAward(row, rankRewardOutcomeStatus(false), {});
    return;
  }

  // 6. Success: persist paid + audit fields, then issue the certificate and
  //    notify (each idempotent), so a retry after success is a no-op.
  const certificateId = await issueRankCertificate({
    guestId: entry.guestId,
    cycle,
    category,
    rank: entry.rank,
    cycleCups: Number(row["cup_count"] ?? entry.cycleCups),
    coins,
  });
  await markAward(row, rankRewardOutcomeStatus(true), {
    transaction_id: transactionId,
    certificate_id: certificateId,
  });

  await notifyGuest(
    entry.guestId,
    "achievement",
    `rank:${cycle.start}:${category}:${entry.rank}`,
    { achievementName: `Weekly Rank #${entry.rank} — ${CATEGORY_LABEL[category]}` },
    {
      referenceType: "ustad_rank_awards",
      referenceId: `${cycle.start}:${category}`,
      actionPath: "/settings",
      metadata: {
        category,
        rank: entry.rank,
        coins,
        cycleStart: cycle.start,
        cupAwarded: cupForRank(entry.rank),
      },
    },
  );
}

/* ------------------------------------------------------------------ */
/* Chat context                                                         */
/* ------------------------------------------------------------------ */

/** Verified leaderboard facts for USTAD AI. Empty when there is nothing real. */
export async function rankContext(guestId: string): Promise<string> {
  const awards = await listRankAwards(guestId);
  return rankContextLine(
    awards.map((a) => ({
      category: a.category,
      rank: a.rank,
      cycleStart: a.cycleStart,
      coins: a.coins,
    })),
  );
}

/**
 * Authoritative weekly-ranking facts for the USTAD AI chat pipeline.
 *
 * Composes the caller's LIVE standing in the current Sunday→Sunday week (real
 * rank among verified cup-holders, per category), the verified cup counts they
 * own, and their settled previous-week awards. It NEVER prints another user's
 * name, rank or cups, and returns "" when the caller has no real records — so
 * the model can answer from facts or say data is unavailable, but can never
 * invent a leaderboard position.
 */
export async function rankChatContext(guestId: string): Promise<string> {
  const lines: string[] = [];
  const cycle = currentCycle();

  // Counts for this caller only (cheap, always safe).
  const mine = await collectCupEvents(guestId);
  const mineTotal = mine.filter((e) => e.guestId === guestId);

  const totalAllTime = new Map<RankCategory, number>();
  for (const e of mineTotal) {
    // "Most Cups" is the union of every category, so each event counts once
    // there AND once toward its own category. Events whose own category is
    // already "most_cups" (normal cups) must not be double-counted.
    totalAllTime.set(e.category, (totalAllTime.get(e.category) ?? 0) + 1);
    if (e.category !== "most_cups")
      totalAllTime.set("most_cups", (totalAllTime.get("most_cups") ?? 0) + 1);
  }

  // Only reach for the global board when this caller has something to rank this
  // week; otherwise they simply are not on the current leaderboard.
  const hasCycleCups = mineTotal.some((e) => inCycle(e, cycle));
  const liveByCategory = new Map<RankCategory, { rank: number; cups: number }>();
  if (hasCycleCups) {
    const events = await collectCupEvents();
    const names = await profileNames([guestId]);
    for (const category of RANK_CATEGORIES) {
      const rows = buildBoard(events, category, cycle).map((r) => ({
        ...r,
        profileName: names[r.guestId] ?? recipientDisplayName({}),
      }));
      const entry = rankEntries(rows, Number.MAX_SAFE_INTEGER).find((r) => r.guestId === guestId);
      if (entry) liveByCategory.set(category, { rank: entry.rank, cups: entry.cycleCups });
    }
  }

  if (liveByCategory.size > 0) {
    const live: string[] = [];
    for (const category of RANK_CATEGORIES) {
      const st = liveByCategory.get(category);
      if (!st) continue;
      live.push(
        `- Live standing in ${CATEGORY_LABEL[category]}: rank #${st.rank} with ${st.cups} verified cup${st.cups === 1 ? "" : "s"} this week (week starting ${cycle.start})`,
      );
    }
    if (live.length)
      lines.push(`USTAD AI weekly leaderboard — this week (authoritative):\n${live.join("\n")}`);
  }

  // All-time verified cups per category (still scoped to this caller).
  const cupsLine: string[] = [];
  for (const category of RANK_CATEGORIES) {
    const n = totalAllTime.get(category) ?? 0;
    if (n > 0)
      cupsLine.push(`- ${n} verified cup${n === 1 ? "" : "s"} in ${CATEGORY_LABEL[category]}`);
  }
  if (cupsLine.length)
    lines.push(
      `USTAD AI verified cup counts for this user (authoritative):\n${cupsLine.join("\n")}`,
    );

  // Settled previous-week awards.
  const awards = await listRankAwards(guestId);
  const settled = rankContextLine(
    awards.map((a) => ({
      category: a.category,
      rank: a.rank,
      cycleStart: a.cycleStart,
      coins: a.coins,
    })),
  );
  if (settled) lines.push(settled);

  return lines.join("\n\n");
}

export { cycleFromStart };
