/**
 * PART 9 — The single USTAD AI notification engine.
 *
 * WHAT WAS MISSING: nine engines (wallet, crorepati, crorepati-entry, mega,
 * trophy, certificate, master-event, avatar, shop) each had their own private
 * `notify()` helper that inserted a hardcoded ENGLISH string into the
 * `reminders` feed. There was no read state, no unread count, no categories,
 * no language, no idempotency and no pagination.
 *
 * WHAT THIS IS: one engine that every one of those call sites now uses. It is
 * deliberately the ONLY writer of `ustad_notifications`, which is what makes
 * duplicate protection and the language rule enforceable in one place rather
 * than nine.
 *
 * Language rule (spec §2-§5): the language is read from the user's EXISTING
 * USTAD AI settings row at the moment the notification is created, and the
 * fully rendered text is stored. Changing the setting later therefore cannot
 * rewrite history, and new notifications immediately use the new language.
 */
import { db, requireGuest } from "./guest.server";
import {
  ACTION_PATH_OF,
  CATEGORY_OF,
  formatExactDateTime,
  normalizeLanguage,
  renderNotification,
  type Language,
  type NotificationCategory,
  type NotificationType,
  type NotificationVars,
} from "./notification-spec";

type Row = Record<string, unknown>;

/* The Part 9 tables are newer than the generated Supabase types, so the client
 * is widened locally — the same approach Parts 7 and 8 use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdb = () => db() as any;

const DEFAULT_TZ = "Asia/Kolkata";

/* ------------------------------------------------------------------ */
/* Language + timezone: read from the EXISTING settings row            */
/* ------------------------------------------------------------------ */

export type GuestLocale = { language: Language; timezone: string };

/**
 * The user's language and timezone from the EXISTING USTAD AI settings.
 * This is the single source of truth (spec §2) — Part 9 adds no preference
 * of its own and never asks the client what language to use.
 */
export async function guestLocale(guestId: string): Promise<GuestLocale> {
  try {
    const { data } = await sdb()
      .from("settings")
      .select("language, timezone")
      .eq("guest_id", guestId)
      .maybeSingle();
    return {
      language: normalizeLanguage(data?.language),
      timezone: String(data?.timezone ?? "") || DEFAULT_TZ,
    };
  } catch {
    return { language: "english", timezone: DEFAULT_TZ };
  }
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export type CreateNotificationInput = {
  guestId: string;
  type: NotificationType;
  /** Idempotency key: one notification per real underlying fact (spec §38). */
  dedupeKey: string;
  vars?: NotificationVars;
  referenceType?: string;
  referenceId?: string;
  metadata?: Row;
  /**
   * Authoritative language override. Used only where an event carries its own
   * language snapshot (spec §5); otherwise the user's setting wins.
   */
  language?: Language;
  /** Event start instant, pre-formatted into reminder text. */
  startAt?: string;
  category?: NotificationCategory;
  actionPath?: string;
};

/**
 * Create one notification.
 *
 * Returns the row, or null when an identical one already exists — the unique
 * (guest_id, dedupe_key) index makes refresh, reconnect, double-click, a
 * second tab and a scheduler retry all collapse to a single notification.
 *
 * Never throws: a notification must not be able to fail the real action that
 * produced it (a coin credit, a purchase, an achievement).
 */
export async function createNotification(input: CreateNotificationInput): Promise<Row | null> {
  try {
    const locale = await guestLocale(input.guestId);
    const language = input.language ?? locale.language;

    const vars: NotificationVars = { ...(input.vars ?? {}) };
    if (input.startAt) {
      // Reminder text embeds the exact start time in the user's own
      // language and timezone (spec §9, §10, §23).
      vars.startAt = formatExactDateTime(input.startAt, language, locale.timezone);
    }

    const { title, message } = renderNotification(input.type, language, vars);

    const { data, error } = await sdb()
      .from("ustad_notifications")
      .insert({
        guest_id: input.guestId,
        type: input.type,
        category: input.category ?? CATEGORY_OF[input.type] ?? "system",
        title,
        message,
        language,
        reference_type: input.referenceType ?? "",
        reference_id: input.referenceId ?? "",
        action_path: input.actionPath ?? ACTION_PATH_OF[input.type] ?? "/",
        metadata: input.metadata ?? {},
        dedupe_key: input.dedupeKey,
      })
      .select("*")
      .maybeSingle();

    if (error) return null; // unique violation == already delivered
    return (data as Row) ?? null;
  } catch {
    return null;
  }
}

/**
 * Convenience wrapper for the nine engines. Keeps their call sites to one
 * line so no engine is tempted to build its own notification again.
 */
export async function notifyGuest(
  guestId: string,
  type: NotificationType,
  dedupeKey: string,
  vars: NotificationVars = {},
  extra: Partial<CreateNotificationInput> = {},
): Promise<Row | null> {
  return createNotification({ guestId, type, dedupeKey, vars, ...extra });
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export type FeedFilter = "all" | "unread" | NotificationCategory;

export type FeedItem = {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  language: Language;
  referenceType: string;
  referenceId: string;
  actionPath: string;
  metadata: Record<string, string | number | boolean | null>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  /** Exact date and time, rendered in the notification's own language. */
  exactTime: string;
};

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
  unreadCount: number;
  language: Language;
  timezone: string;
};

const PAGE_SIZE = 25;

/** Narrow jsonb metadata to plain serializable scalars for the client. */
function toPlainMetadata(value: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

function toFeedItem(row: Row, timezone: string): FeedItem {
  const language = normalizeLanguage(row["language"]);
  const createdAt = String(row["created_at"]);
  return {
    id: String(row["id"]),
    type: String(row["type"]),
    category: String(row["category"]),
    title: String(row["title"]),
    message: String(row["message"] ?? ""),
    language,
    referenceType: String(row["reference_type"] ?? ""),
    referenceId: String(row["reference_id"] ?? ""),
    actionPath: String(row["action_path"] ?? "/"),
    metadata: toPlainMetadata(row["metadata"]),
    isRead: Boolean(row["is_read"]),
    readAt: (row["read_at"] as string) ?? null,
    createdAt,
    // Rendered in the language the notification was STORED in, not the
    // current setting, so history stays historically accurate (spec §5).
    exactTime: formatExactDateTime(createdAt, language, timezone),
  };
}

/**
 * One page of the activity history, newest first (spec §39, §46).
 *
 * Ownership comes from the signed token, never from a client-supplied id, so
 * one guest can never page through another's notifications (spec §32, §33).
 */
export async function listNotifications(args: {
  token: unknown;
  filter?: FeedFilter;
  cursor?: string | null;
  limit?: number;
}): Promise<FeedPage> {
  const guestId = await requireGuest(args.token);
  const locale = await guestLocale(guestId);
  const limit = Math.min(Math.max(args.limit ?? PAGE_SIZE, 1), 50);

  let q = sdb()
    .from("ustad_notifications")
    .select("*")
    .eq("guest_id", guestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const filter = args.filter ?? "all";
  if (filter === "unread") q = q.eq("is_read", false);
  else if (filter !== "all") q = q.eq("category", filter);
  if (args.cursor) q = q.lt("created_at", args.cursor);

  const { data } = await q;
  const rows = (data as Row[]) ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((r) => toFeedItem(r, locale.timezone)),
    nextCursor: hasMore ? String(page[page.length - 1]?.["created_at"] ?? "") : null,
    unreadCount: await unreadCount(guestId),
    language: locale.language,
    timezone: locale.timezone,
  };
}

/** Unread badge count, straight from the database — never hardcoded (spec §6). */
export async function unreadCount(guestId: string): Promise<number> {
  try {
    const { count } = await sdb()
      .from("ustad_notifications")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guestId)
      .eq("is_read", false)
      .is("deleted_at", null);
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

export async function getUnreadCount(token: unknown): Promise<number> {
  const guestId = await requireGuest(token);
  return unreadCount(guestId);
}

/* ------------------------------------------------------------------ */
/* Read state                                                          */
/* ------------------------------------------------------------------ */

/** Mark one notification read. Scoped to the owner (spec §35, §44). */
export async function markRead(args: { token: unknown; id: string }): Promise<{ unread: number }> {
  const guestId = await requireGuest(args.token);
  await sdb()
    .from("ustad_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("guest_id", guestId) // ownership is enforced here, not by the client
    .eq("id", args.id)
    .eq("is_read", false)
    .is("deleted_at", null);
  return { unread: await unreadCount(guestId) };
}

export async function markAllRead(token: unknown): Promise<{ unread: number }> {
  const guestId = await requireGuest(token);
  await sdb()
    .from("ustad_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("guest_id", guestId)
    .eq("is_read", false)
    .is("deleted_at", null);
  return { unread: await unreadCount(guestId) };
}

/**
 * Delete ONE notification — independent from every other row.
 *
 * Ownership is enforced here (never trusted from the client), so a guest can
 * only ever remove their own notification. It is a soft-delete tombstone:
 * the row is excluded from the feed, the unread badge and the detail view, but
 * kept so history stays intact and a deleted reminder is never re-announced.
 */
export async function deleteNotification(args: {
  token: unknown;
  id: string;
}): Promise<{ ok: true; unread: number }> {
  const guestId = await requireGuest(args.token);
  await sdb()
    .from("ustad_notifications")
    .update({ deleted_at: new Date().toISOString() })
    .eq("guest_id", guestId)
    .eq("id", args.id)
    .is("deleted_at", null);
  return { ok: true, unread: await unreadCount(guestId) };
}

/* ------------------------------------------------------------------ */
/* Detail + real-data enrichment                                       */
/* ------------------------------------------------------------------ */

export type DetailSectionKey =
  | "what"
  | "when"
  | "howToPlay"
  | "requirements"
  | "duration"
  | "entry"
  | "reward"
  | "howToJoin"
  | "notes"
  | "rules";

export type NotificationDetail = FeedItem & {
  sections: Array<{ key: DetailSectionKey; value: string }>;
  /** Button target: always an EXISTING screen (never a duplicate page). */
  openPath: string;
};

/** Human, localized duration label from a millisecond span. */
function durationLabel(ms: number, language: Language): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  const hoursPart =
    language === "hindi" ? `${h} घंटे` : language === "hinglish" ? `${h} ghante` : `${h} hr`;
  const minPart = mins > 0 ? ` ${mins}m` : "";
  return `${hoursPart}${minPart}`;
}

/** Load one notification row for a guest (deleted rows are gone). */
async function notificationRow(guestId: string, id: string): Promise<Row | null> {
  const { data } = await sdb()
    .from("ustad_notifications")
    .select("*")
    .eq("guest_id", guestId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Row) ?? null;
}

/** Localized number label for a coin amount (Indian grouping). */
function coinLabel(n: number): string {
  return `${(n ?? 0).toLocaleString("en-IN")} USTAD Coins`;
}

/**
 * Full, structured detail for one notification. The title/message come from
 * the stored row (the SHORT preview); the labelled sections are enriched from
 * REAL configured data when the notification refers to a real event or coin
 * offer — never invented. When there is nothing real to enrich from, only the
 * stored message is shown.
 *
 * Opening a detail also marks it read (server-side), so the badge drops.
 */
export async function notificationDetail(args: {
  token: unknown;
  id: string;
}): Promise<NotificationDetail | null> {
  const guestId = await requireGuest(args.token);
  const row = await notificationRow(guestId, String(args.id ?? ""));
  if (!row) return null;

  // Opening a notification means the user read it (spec: read on open).
  if (!row["is_read"]) {
    await sdb()
      .from("ustad_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("guest_id", guestId)
      .eq("id", row["id"])
      .eq("is_read", false);
  }

  const locale = await guestLocale(guestId);
  const language = normalizeLanguage(row["language"]);
  const tz = locale.timezone;
  const type = String(row["type"]);
  const metadata = (row["metadata"] ?? {}) as Row;
  const sections: NotificationDetail["sections"] = [];

  const push = (key: DetailSectionKey, value: string) => {
    if (value) sections.push({ key, value });
  };

  // ---- Master Event referenced by this notification ----------------------
  if (String(row["reference_type"] ?? "") === "master_event" && row["reference_id"]) {
    const { data: ev } = await sdb()
      .from("master_events")
      .select(
        "id, code, name, description, event_type, status, start_time, end_time, question_count, entry_config, reward_config",
      )
      .eq("id", row["reference_id"])
      .maybeSingle();
    if (ev) {
      const e = ev as Row;
      push("what", String(e["description"] ?? String(e["name"] ?? "")));
      const start = e["start_time"] ? String(e["start_time"]) : "";
      const end = e["end_time"] ? String(e["end_time"]) : "";
      if (start) {
        const startText = formatExactDateTime(start, language, tz);
        const endText = end ? formatExactDateTime(end, language, tz) : "";
        push("when", end ? `${startText} → ${endText}` : startText);
      }
      if (start && end) {
        push("duration", durationLabel(Date.parse(end) - Date.parse(start), language));
      }
      const entryCfg = (e["entry_config"] ?? {}) as Row;
      const entryType = String(entryCfg["type"] ?? "free");
      const cost = Number(entryCfg["coinCost"] ?? entryCfg["cost"] ?? 0);
      if (entryType !== "free" && cost > 0) {
        push("entry", coinLabel(cost));
      } else {
        push(
          "entry",
          language === "hindi" ? "निःशुल्क" : language === "hinglish" ? "Free" : "Free",
        );
      }
      const rewardCfg = (e["reward_config"] ?? {}) as Row;
      const win = Number(rewardCfg["win"] ?? 0);
      if (win > 0) push("reward", coinLabel(win));
      const qn = Number(e["question_count"] ?? 0);
      if (qn > 0) push("requirements", `${qn} questions`);
      // Reuse the live event status as a note.
      const st = String(e["status"] ?? "");
      if (st) {
        const statusLabel =
          st === "open" || st === "active"
            ? language === "hindi"
              ? "अभी चल रहा है"
              : language === "hinglish"
                ? "abhi chal raha hai"
                : "now open"
            : st;
        push("notes", `${String(e["name"] ?? "")} · ${statusLabel}`);
      }
    }
  }

  // ---- Global Coin Offer referenced by this notification ------------------
  if ((type === "offer_coming_soon" || type === "offer_live") && metadata["weeklyOfferId"]) {
    const wid = String(metadata["weeklyOfferId"]);
    const { data: off } = await sdb()
      .from("ustad_coin_offers")
      .select("weekly_offer_id, discount_pct, start_iso, end_iso")
      .eq("weekly_offer_id", wid)
      .maybeSingle();
    if (off) {
      const pct = Number(off["discount_pct"] ?? 0);
      const oStart = String(off["start_iso"] ?? "");
      const oEnd = String(off["end_iso"] ?? "");
      push(
        "what",
        language === "hindi"
          ? `सभी eligible USTAD Coin खरीद पर ${pct}% वास्तविक छूट।`
          : language === "hinglish"
            ? `Saare eligible USTAD Coin purchases par ${pct}% real discount.`
            : `${pct}% real discount on every eligible USTAD Coin purchase across the whole app.`,
      );
      if (oStart && oEnd) {
        push(
          "when",
          `${formatExactDateTime(oStart, language, tz)} → ${formatExactDateTime(oEnd, language, tz)}`,
        );
        push("duration", durationLabel(Date.parse(oEnd) - Date.parse(oStart), language));
      }
      push(
        "requirements",
        language === "hindi"
          ? "सभी सिक्का-आधारित आइटम (शॉप, टूर्नामेंट, इवेंट, पास) eligible हैं।"
          : language === "hinglish"
            ? "Saare coin-based items (shop, tournament, event, pass) eligible hain."
            : "All coin-based items (shop, tournaments, events, passes) are eligible.",
      );
    }
  }

  const feedItem = toFeedItem(row, tz);
  return {
    ...feedItem,
    sections,
    openPath:
      (metadata["openPath"] as string) ||
      String(row["action_path"] ?? ACTION_PATH_OF[type as NotificationType] ?? "/"),
  };
}

/**
 * Broadcast an announcement (system announcement / new feature) to every real
 * active guest. NOT exposed to the browser — callers are server tasks guarded
 * by the shared cron secret. Each guest gets one row (unique guest+dedupe),
 * so re-running is a no-op per guest.
 */
export async function broadcastAnnouncement(input: {
  type: "new_feature" | "important_update";
  dedupeKey: string;
  vars?: NotificationVars;
  referenceType?: string;
  referenceId?: string;
  openPath?: string;
  limit?: number;
}): Promise<number> {
  const { data } = await sdb()
    .from("guests")
    .select("id")
    .limit(input.limit ?? 1000);
  const guests = ((data as Row[]) ?? []).map((r) => String(r["id"]));
  let sent = 0;
  for (const guestId of guests) {
    const base = {
      guestId,
      type: input.type,
      dedupeKey: `announce:${input.dedupeKey}`,
    };
    const opts: Parameters<typeof createNotification>[0] = { ...base };
    if (input.vars) opts.vars = input.vars;
    if (input.referenceType) opts.referenceType = input.referenceType;
    if (input.referenceId) opts.referenceId = input.referenceId;
    if (input.openPath) {
      opts.metadata = { openPath: input.openPath };
      opts.actionPath = input.openPath;
    }
    const row = await createNotification(opts);
    if (row) sent += 1;
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* Upcoming events (spec §22, §40)                                     */
/* ------------------------------------------------------------------ */

export type UpcomingEvent = {
  id: string;
  code: string;
  name: string;
  eventType: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  startsAtText: string;
  endsAtText: string;
  entryText: string;
  rewardText: string;
};

function entryLabel(cfg: Row, language: Language): string {
  const type = String(cfg?.["type"] ?? "free");
  const cost = Number(cfg?.["coinCost"] ?? cfg?.["cost"] ?? 0);
  if (type === "free" || cost <= 0) {
    return language === "hindi" ? "निःशुल्क" : "Free";
  }
  return `${cost.toLocaleString("en-IN")} USTAD Coins`;
}

function rewardLabel(cfg: Row): string {
  const win = Number(cfg?.["win"] ?? 0);
  return win > 0 ? `${win.toLocaleString("en-IN")} USTAD Coins` : "";
}

/**
 * Upcoming events from the EXISTING Master Event Engine (Part 6) — this does
 * not maintain its own event list.
 */
export async function listUpcomingEvents(token: unknown): Promise<{
  events: UpcomingEvent[];
  language: Language;
  timezone: string;
}> {
  const guestId = await requireGuest(token);
  const locale = await guestLocale(guestId);
  const nowIso = new Date().toISOString();

  const { data } = await sdb()
    .from("master_events")
    .select("id, code, name, event_type, status, start_time, end_time, entry_config, reward_config")
    .in("status", ["scheduled", "open", "active"])
    .gte("end_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(10);

  const rows = (data as Row[]) ?? [];
  return {
    events: rows.map((r) => ({
      id: String(r["id"]),
      code: String(r["code"]),
      name: String(r["name"]),
      eventType: String(r["event_type"]),
      status: String(r["status"]),
      startTime: (r["start_time"] as string) ?? null,
      endTime: (r["end_time"] as string) ?? null,
      startsAtText: r["start_time"]
        ? formatExactDateTime(String(r["start_time"]), locale.language, locale.timezone)
        : "",
      endsAtText: r["end_time"]
        ? formatExactDateTime(String(r["end_time"]), locale.language, locale.timezone)
        : "",
      entryText: entryLabel((r["entry_config"] as Row) ?? {}, locale.language),
      rewardText: rewardLabel((r["reward_config"] as Row) ?? {}),
    })),
    language: locale.language,
    timezone: locale.timezone,
  };
}

/* ------------------------------------------------------------------ */
/* AI context                                                          */
/* ------------------------------------------------------------------ */

/** Real notification facts for USTAD AI, so it never invents them. */
export async function notificationContext(guestId: string): Promise<string> {
  try {
    const unread = await unreadCount(guestId);
    const { data } = await sdb()
      .from("ustad_notifications")
      .select("title, created_at")
      .eq("guest_id", guestId)
      .order("created_at", { ascending: false })
      .limit(5);
    const rows = (data as Row[]) ?? [];
    const recent = rows.map((r) => `${r["title"]}`).join("; ");
    return [
      `USTAD AI notifications (authoritative, from the database):`,
      `unread notifications ${unread}.`,
      recent ? `Most recent: ${recent}.` : `No notifications yet.`,
      `Never estimate or invent notification counts or contents.`,
    ].join(" ");
  } catch {
    return "";
  }
}
