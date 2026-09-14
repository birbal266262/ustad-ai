/**
 * Weekly rank reward settlement + weekly certificate identity — pure unit tests.
 *
 * These test the exact-once / retry state machine (Issue: rank reward can be
 * lost or double-paid) and the deterministic weekly-certificate reference that
 * the unique (guest_id, reference_key) index is built on (Issue: certificate
 * duplicate from scanning a limited window).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isRankRewardPaid,
  isRankRewardPayable,
  rankRewardOutcomeStatus,
  rankRewardClaimStatus,
  rankRewardRef,
  weeklyRankCertificateRef,
  rankContextLine,
  currentCycle,
  previousCycle,
  type RankCategory,
} from "../src/lib/rank-spec.ts";

/* ------------------------------------------------------------------ */
/* Reward state machine — the core of the atomicity fix                */
/* ------------------------------------------------------------------ */

test("successful reward is recorded as paid and is no longer payable", () => {
  const status = rankRewardOutcomeStatus(true);
  assert.equal(status, "paid");
  assert.equal(isRankRewardPaid(status), true);
  assert.equal(isRankRewardPayable(status), false);
});

test("a failed coin credit leaves the reward retryable, never marked paid", () => {
  const status = rankRewardOutcomeStatus(false);
  assert.equal(status, "failed");
  assert.equal(isRankRewardPaid(status), false);
  assert.equal(isRankRewardPayable(status), true);
});

test("a pending reward is payable; retry after failure is allowed", () => {
  assert.equal(isRankRewardPayable("pending"), true);
  // After a failure the same row can be retried.
  assert.equal(isRankRewardPayable(rankRewardOutcomeStatus(false)), true);
});

test("repeated retry after success never pays again", () => {
  // Once paid, a retry (whatever status it would otherwise be) is a no-op.
  assert.equal(isRankRewardPaid("paid"), true);
  assert.equal(isRankRewardPayable("paid"), false);
});

test("concurrent settlement cannot double-pay: only one may claim a row", () => {
  // Claim moves a payable row to `processing`; a second concurrent attempt that
  // observes `processing` must skip (not payable, not paid → do nothing).
  const claimed = rankRewardClaimStatus();
  assert.equal(claimed, "processing");
  assert.equal(isRankRewardPayable(claimed), false, "processing must not be paid");
  assert.equal(isRankRewardPaid(claimed), false, "processing is not yet settled");
});

test("unknown/missing status is never payable or paid (defensive)", () => {
  assert.equal(isRankRewardPayable(null), false);
  assert.equal(isRankRewardPayable(undefined), false);
  assert.equal(isRankRewardPaid(undefined), false);
});

/* ------------------------------------------------------------------ */
/* Reward ref id is deterministic (ledger replay-safety)               */
/* ------------------------------------------------------------------ */

test("rank reward ref is stable per week/category/rank", () => {
  const a = rankRewardRef("2026-09-06", "most_cups", 1);
  assert.equal(rankRewardRef("2026-09-06", "most_cups", 1), a);
  assert.notEqual(rankRewardRef("2026-09-13", "most_cups", 1), a); // next week
  assert.notEqual(rankRewardRef("2026-09-06", "mega", 1), a); // different category
});

/* ------------------------------------------------------------------ */
/* Weekly certificate identity — deterministic + old-week safe         */
/* ------------------------------------------------------------------ */

const cat: RankCategory = "most_cups";

test("weekly certificate reference is deterministic and unique per identity", () => {
  const a = weeklyRankCertificateRef("2026-09-06", cat, 1);
  assert.equal(weeklyRankCertificateRef("2026-09-06", cat, 1), a);
  assert.notEqual(weeklyRankCertificateRef("2026-09-13", cat, 1), a); // different week
  assert.notEqual(weeklyRankCertificateRef("2026-09-06", "mega", 1), a); // different category
  assert.notEqual(weeklyRankCertificateRef("2026-09-06", cat, 2), a); // different rank
});

test("old weeks resolve to their own reference (no latest-N window dependency)", () => {
  // A certificate from weeks ago has the same shape as today's — nothing scans
  // a limited window, so old weeks are found and never duplicated.
  const old = weeklyRankCertificateRef("2026-07-12", cat, 3);
  const fresh = weeklyRankCertificateRef(currentCycle().start, cat, 3);
  assert.notEqual(old, fresh);
  assert.ok(old.startsWith("2026-07-12:"));
});

/* ------------------------------------------------------------------ */
/* AI rank context — authoritative, empty when nothing real            */
/* ------------------------------------------------------------------ */

test("rank context is empty when there are no real awards (AI cannot invent)", () => {
  assert.equal(rankContextLine([]), "");
});

test("rank context reports only authoritative award facts", () => {
  const line = rankContextLine([
    { category: cat, rank: 1, cycleStart: "2026-09-06", coins: 20000000 },
    { category: "mega", rank: 2, cycleStart: "2026-09-06", coins: 10000000 },
  ]);
  assert.ok(line.includes("Rank #1 in Most Cups for the week starting 2026-09-06"));
  assert.ok(line.includes("2,00,00,000 USTAD Coins"));
  assert.ok(line.includes("authoritative"));
});

test("current/previous IST cycles are distinct and ordered", () => {
  const now = new Date("2026-09-09T06:00:00Z");
  const cur = currentCycle(now);
  const prev = previousCycle(cur);
  // previous cycle starts 7 days before the current one.
  assert.equal(
    Date.parse(`${prev.start}T00:00:00Z`),
    Date.parse(`${cur.start}T00:00:00Z`) - 7 * 86_400_000,
  );
  assert.ok(prev.start < cur.start);
});
