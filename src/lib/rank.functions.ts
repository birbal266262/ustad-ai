/**
 * USTAD AI — Weekly Leaderboard / All Cups server function boundary.
 *
 * READ-ONLY for the client. The client may ask for the public seven-category
 * leaderboard, its OWN verified cups, and its OWN settled weekly rank awards.
 * It may never supply a rank, a cup count, a reward, a category, a guest id or
 * a week — every number is computed server-side from verified records in
 * `rank-engine.server.ts` (settlement is immutable + idempotent there).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireGuest } from "./guest.server";
import * as engine from "./rank-engine.server";

/** Public top-20 per category for the current week + this guest's own awards. */
export const leaderboardFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data: d }) => {
    const guestId = await requireGuest(d.token);
    return engine.getLeaderboard(guestId);
  });

/** Every verified cup this guest owns, with full provenance (owner only). */
export const allCupsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data: d }) => {
    const guestId = await requireGuest(d.token);
    return engine.getAllCups(guestId);
  });
