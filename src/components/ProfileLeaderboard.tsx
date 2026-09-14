/**
 * ProfileLeaderboard — Weekly Ranking + All Cups, rendered INSIDE the existing
 * USTAD profile (settings → Profile).
 *
 * Everything here comes from REAL verified records read through
 * `rank-engine.server.ts` (via `leaderboardFn` / `allCupsFn`). There is
 * deliberately no mock/static data: an empty board, an empty cup list or an
 * empty award list renders a proper empty state instead of a fake row.
 *
 * The top-20 board is public competition data (a leaderboard's whole point);
 * the caller's OWN live standing and OWN settled awards are scoped to them.
 */
import { useCallback, useEffect, useState } from "react";
import { Award, Crown, Loader2, Medal, RotateCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useGuest } from "@/lib/ustad-client";
import { leaderboardFn, allCupsFn } from "@/lib/rank.functions";
import {
  RANK_CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_DESCRIPTION,
  formatCoins,
} from "@/lib/rank-spec";
import type { RankCategory } from "@/lib/rank-spec";

type BoardEntry = {
  rank: number;
  guestId: string;
  profileName: string;
  cycleCups: number;
  totalCups: number;
  firstCupAt: string;
};
type CategoryBoardView = {
  category: RankCategory;
  label: string;
  entries: BoardEntry[];
  you: BoardEntry | null;
};
type RankAwardItem = {
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
type LeaderboardPayload = {
  cycle: { start: string; end: string; id: string };
  boards: CategoryBoardView[];
  myAwards: RankAwardItem[];
};
type CupDetailView = {
  key: string;
  label: string;
  category: RankCategory;
  categoryLabel: string;
  source: string;
  reference: string;
  awardedAt: string;
  cycleStart: string;
};

const MEDAL_ICON: Record<number, typeof Medal | null> = {
  1: Crown,
  2: Medal,
  3: Medal,
};

function fmtWeek(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function rankTone(rank: number): string {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-orange-400";
  return "text-muted-foreground";
}

export function ProfileLeaderboard() {
  const { token, session } = useGuest();
  const myId = session?.guestId ?? "";
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [cups, setCups] = useState<CupDetailView[] | null>(null);
  const [active, setActive] = useState<RankCategory>("most_cups");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    if (!token) return;
    setState("loading");
    try {
      const [lb, allCups] = await Promise.all([
        leaderboardFn({ data: { token } }),
        allCupsFn({ data: { token } }),
      ]);
      setPayload(lb as unknown as LeaderboardPayload);
      setCups(allCups as unknown as CupDetailView[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="panel mt-4 flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading leaderboard &amp; cups…
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="panel mt-4 flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span>Leaderboard could not be loaded right now.</span>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!payload) return null;
  const board = payload.boards.find((b) => b.category === active) ?? payload.boards[0]!;
  const myRankHere = board?.you ?? null;

  return (
    <div className="panel mt-4 space-y-4 p-5" data-testid="profile-leaderboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Weekly Leaderboard</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          title="Refresh from live verified records"
        >
          <RotateCw className="mr-1 h-3.5 w-3.5" />
          <span className="text-xs">Refresh</span>
        </Button>
      </div>

      {/* Current Sunday→Sunday week (India time), server-authoritative. */}
      <div className="rounded-md bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
        Current week:{" "}
        <span className="font-semibold">
          {fmtWeek(payload.cycle.start)} – {fmtWeek(payload.cycle.end)}
        </span>
        <span className="ml-1">(Sun → Sun, India time)</span>
      </div>

      {/* Category pills */}
      <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
        {RANK_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
              active === c
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {board ? (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold">{board.label}</p>
            <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTION[board.category]}</p>
          </div>

          {board.entries.length === 0 && !myRankHere ? (
            <p className="text-sm text-muted-foreground">
              No verified cups in this category yet this week. Win one to appear here.
            </p>
          ) : (
            <ol className="space-y-1 text-sm" data-testid="leaderboard-entries">
              {board.entries.map((e) => {
                const Icon = MEDAL_ICON[e.rank] ?? null;
                const isMe = e.guestId === myId;
                return (
                  <li
                    key={e.guestId}
                    data-testid={isMe ? "leaderboard-you-row" : undefined}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                      isMe ? "border-primary/50 bg-primary/5" : "border-border/50"
                    }`}
                  >
                    <span className={`flex w-6 shrink-0 justify-center ${rankTone(e.rank)}`}>
                      {Icon ? (
                        <Icon className="h-4 w-4" />
                      ) : (
                        <span className="text-xs">{e.rank}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate font-medium">
                        {e.profileName}
                        {isMe ? (
                          <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {e.cycleCups} cup{e.cycleCups === 1 ? "" : "s"} this week · {e.totalCups}{" "}
                        total
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {myRankHere && myRankHere.rank > board.entries.length ? (
            <div className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
              <span className={`flex w-6 justify-center ${rankTone(myRankHere.rank)}`}>
                <span className="text-xs">#{myRankHere.rank}</span>
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">You</span>
                <span className="block text-xs text-muted-foreground">
                  {myRankHere.cycleCups} cup{myRankHere.cycleCups === 1 ? "" : "s"} this week
                </span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Settled weekly rank awards (this user only) */}
      {payload.myAwards.length > 0 ? (
        <div className="space-y-2 pt-1">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Your settled weekly ranks
          </p>
          <ul className="space-y-1">
            {payload.myAwards.map((a) => (
              <li
                key={`${a.cycleStart}-${a.category}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    Rank #{a.rank} · {a.categoryLabel}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Week {fmtWeek(a.cycleStart)} – {fmtWeek(a.cycleEnd)} · {a.cupCount} cups
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block font-semibold text-emerald-500">
                    {formatCoins(a.coins)} coins
                  </span>
                  <span className="block text-muted-foreground">
                    {a.certificateId ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <Award className="h-3 w-3" /> Certificate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Trophy className="h-3 w-3" /> {a.cupAwarded ? "Cup earned" : "Rank"}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="pt-1 text-xs text-muted-foreground">
          No settled weekly ranks yet. Ranks settle each Sunday in India time.
        </p>
      )}

      {/* All Cups */}
      <AllCups cups={cups} myId={myId} />
    </div>
  );
}

function AllCups({ cups, myId }: { cups: CupDetailView[] | null; myId: string }) {
  if (cups === null) return null;
  return (
    <div className="space-y-2 border-t border-border/60 pt-3" data-testid="profile-all-cups">
      <Label>All Cups</Label>
      {cups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No verified cups yet. Every verified tournament, event and rank cup you earn will appear
          here.
        </p>
      ) : (
        <ul className="space-y-1">
          {cups.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  <Trophy className="mr-1 inline h-3.5 w-3.5 align-[-1px] text-amber-500" />
                  {c.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {c.categoryLabel} · {c.source}
                  {c.awardedAt ? ` · ${fmtDate(c.awardedAt)}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs text-emerald-500">Verified</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
