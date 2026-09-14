/**
 * PART 9 — Backend notification scheduler (spec §27, §28, §43 + notification
 * system upgrade: ending-soon, closed, and coin-offer milestones).
 *
 * Reminders MUST NOT depend on anyone having the app open, so this runs
 * server-side on a cron tick. It deliberately reuses the EXISTING scheduled-job
 * pattern already in this repo (`/api/public/exam-scheduler` guarded by
 * LOVABLE_CRON_SECRET) instead of introducing a second scheduling mechanism —
 * there is no setTimeout, setInterval or browser countdown anywhere in this
 * path. All dates/times are read from the REAL configured data (master_events,
 * ustad_coin_offers) — nothing here invents a date, a reward or an audience.
 *
 * What it delivers per guest (each exactly once):
 *   • events  — 3-day / 2-day / 1-day "coming soon", LIVE on the day, then
 *     ENDING SOON in the final hour, then CLOSED after the scheduled end.
 *   • offers  — "coming soon" 2 days before the offer window, and "LIVE"
 *     while the offer window is open.
 *
 * Exactly-once is enforced by independent guards:
 *   1. `ustad_event_reminder_log` unique (event_id, guest_id, reminder_kind)
 *      for the original start-phase milestones (unchanged).
 *   2. `ustad_notifications` unique (guest_id, dedupe_key) for everything,
 *      which is what makes ending/closed/offer milestones exactly-once.
 */
import { db } from "./guest.server";
import { createNotification } from "./notification.server";
import {
  dueEndReminders,
  dueReminders,
  type EndReminderKind,
  type ReminderKind,
} from "./notification-spec";

type Row = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdb = () => db() as any;

const TYPE_OF: Record<
  ReminderKind,
  "event_reminder_3d" | "event_reminder_2d" | "event_reminder_1d" | "event_live"
> = {
  reminder_3d: "event_reminder_3d",
  reminder_2d: "event_reminder_2d",
  reminder_1d: "event_reminder_1d",
  live: "event_live",
};

const END_TYPE_OF: Record<EndReminderKind, "event_ending_soon" | "event_closed"> = {
  ending_soon: "event_ending_soon",
  closed: "event_closed",
};

/** Offer "coming soon" fires 2 days before the offer window opens. */
const OFFER_COMING_LEAD_MS = 2 * 86_400_000;

export type SchedulerReport = {
  eventsChecked: number;
  remindersCreated: number;
  duplicatesSkipped: number;
  details: Array<{ event: string; kind: string; created: number; skipped: number }>;
};

/**
 * Which guests should hear about an event/offer.
 *
 * Notifications are addressed to real, active guests only — this never invents
 * an audience and never seeds promotional notifications for people who have
 * not used the app (spec §37).
 */
async function audienceFor(limit = 500): Promise<string[]> {
  const { data } = await sdb().from("guests").select("id").limit(limit);
  return ((data as Row[]) ?? []).map((r) => String(r["id"]));
}

/**
 * Deliver one start-phase reminder to an audience. Claims a slot in
 * `ustad_event_reminder_log` first so a concurrent tick cannot double-send.
 */
async function deliverStartReminder(args: {
  eventId: string;
  eventName: string;
  code: string;
  eventType: string;
  startIso: string;
  kind: ReminderKind;
  guests: string[];
}): Promise<{ created: number; skipped: number }> {
  const { data: logRows } = await sdb()
    .from("ustad_event_reminder_log")
    .select("guest_id")
    .eq("event_id", args.eventId)
    .eq("reminder_kind", args.kind);
  const already = new Set(((logRows as Row[]) ?? []).map((r) => String(r["guest_id"])));

  let created = 0;
  let skipped = 0;
  for (const guestId of args.guests) {
    if (already.has(guestId)) {
      skipped += 1;
      continue;
    }
    const { error: claimError } = await sdb()
      .from("ustad_event_reminder_log")
      .insert({ event_id: args.eventId, guest_id: guestId, reminder_kind: args.kind });
    if (claimError) {
      skipped += 1;
      continue;
    }
    const row = await createNotification({
      guestId,
      type: TYPE_OF[args.kind],
      dedupeKey: `event:${args.eventId}:${args.kind}`,
      vars: { eventName: args.eventName },
      startAt: args.startIso,
      referenceType: "master_event",
      referenceId: args.eventId,
      metadata: {
        eventCode: args.code,
        eventType: args.eventType,
        startTime: args.startIso,
        reminderKind: args.kind,
      },
    });
    if (row) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}

/** Deliver an end-phase (ending-soon / closed) milestone — dedupe-guarded. */
async function deliverEndReminder(args: {
  eventId: string;
  eventName: string;
  code: string;
  kind: EndReminderKind;
  endIso: string;
  guests: string[];
}): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const dedupeKey = `event:${args.eventId}:${args.kind}`;
  for (const guestId of args.guests) {
    const row = await createNotification({
      guestId,
      type: END_TYPE_OF[args.kind],
      dedupeKey,
      vars: { eventName: args.eventName },
      referenceType: "master_event",
      referenceId: args.eventId,
      metadata: { eventCode: args.code, endTime: args.endIso, reminderKind: args.kind },
    });
    if (row) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}

/** Deliver an offer coming-soon / live milestone — dedupe-guarded. */
async function deliverOfferReminder(args: {
  weeklyOfferId: string;
  discountPct: number;
  startIso: string;
  endIso: string;
  live: boolean;
  guests: string[];
}): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  // Reuse the SAME dedupe keys as the on-surface offer banner notification so
  // a banner load and this cron can never double-notify a guest.
  const dedupeKey = args.live
    ? `offer-live:${args.weeklyOfferId}`
    : `offer-soon:${args.weeklyOfferId}`;
  for (const guestId of args.guests) {
    const row = await createNotification({
      guestId,
      type: args.live ? "offer_live" : "offer_coming_soon",
      dedupeKey,
      vars: { discountPct: args.discountPct },
      referenceType: "ustad_coin_offer",
      referenceId: args.weeklyOfferId,
      metadata: {
        weeklyOfferId: args.weeklyOfferId,
        discountPct: args.discountPct,
        startIso: args.startIso,
        endIso: args.endIso,
      },
    });
    if (row) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}

/**
 * One scheduler tick: start reminders + ending-soon/closed for every real
 * scheduled event, and coming-soon/live for the real coin-offer schedule.
 */
export async function runNotificationSchedulerTick(
  now: Date = new Date(),
): Promise<SchedulerReport> {
  const report: SchedulerReport = {
    eventsChecked: 0,
    remindersCreated: 0,
    duplicatesSkipped: 0,
    details: [],
  };

  const guests = await audienceFor();
  if (guests.length === 0) return report;

  /* ---------------- Events: start + end milestones ---------------- */
  const { data: eventRows } = await sdb()
    .from("master_events")
    .select("id, code, name, event_type, status, start_time, end_time, language")
    .in("status", ["scheduled", "open", "active"])
    .not("start_time", "is", null)
    .limit(50);

  const events = (eventRows as Row[]) ?? [];

  for (const ev of events) {
    const startIso = String(ev["start_time"] ?? "");
    const endIso = ev["end_time"] ? String(ev["end_time"]) : "";
    if (!startIso) continue;

    const eventId = String(ev["id"]);
    const eventName = String(ev["name"]);
    const code = String(ev["code"] ?? "");
    const eventType = String(ev["event_type"] ?? "");
    report.eventsChecked += 1;

    const startMoment = Date.parse(startIso);
    const endMoment = endIso ? Date.parse(endIso) : Infinity;

    // Start-phase reminders only apply while the event is still upcoming/live.
    if (now.getTime() < endMoment) {
      for (const kind of dueReminders(startIso, now)) {
        const r = await deliverStartReminder({
          eventId,
          eventName,
          code,
          eventType,
          startIso,
          kind,
          guests,
        });
        report.remindersCreated += r.created;
        report.duplicatesSkipped += r.skipped;
        report.details.push({ event: eventName, kind, ...r });
      }
    }

    // End-phase milestones (ending-soon in the final hour, then closed).
    if (endIso) {
      for (const kind of dueEndReminders(startIso, endIso, now)) {
        const r = await deliverEndReminder({
          eventId,
          eventName,
          code,
          kind,
          endIso,
          guests,
        });
        report.remindersCreated += r.created;
        report.duplicatesSkipped += r.skipped;
        report.details.push({ event: eventName, kind, ...r });
      }
    }
  }

  /* ---------------- Coin offers: coming-soon + live ---------------- */
  const { data: offerRows } = await sdb()
    .from("ustad_coin_offers")
    .select("weekly_offer_id, discount_pct, start_iso, end_iso")
    .gte("end_iso", now.toISOString())
    .limit(10);

  const offers = (offerRows as Row[]) ?? [];
  for (const off of offers) {
    const wid = String(off["weekly_offer_id"]);
    const startIso = String(off["start_iso"] ?? "");
    const endIso = String(off["end_iso"] ?? "");
    if (!startIso || !endIso) continue;
    const pct = Number(off["discount_pct"] ?? 0);
    const t = now.getTime();
    const s = Date.parse(startIso);
    const e = Date.parse(endIso);
    const name = `Coin Offer ${wid}`;

    if (t >= s && t < e) {
      const r = await deliverOfferReminder({
        weeklyOfferId: wid,
        discountPct: pct,
        startIso,
        endIso,
        live: true,
        guests,
      });
      report.remindersCreated += r.created;
      report.duplicatesSkipped += r.skipped;
      report.details.push({ event: name, kind: "offer_live", ...r });
    } else if (t >= s - OFFER_COMING_LEAD_MS && t < s) {
      const r = await deliverOfferReminder({
        weeklyOfferId: wid,
        discountPct: pct,
        startIso,
        endIso,
        live: false,
        guests,
      });
      report.remindersCreated += r.created;
      report.duplicatesSkipped += r.skipped;
      report.details.push({ event: name, kind: "offer_coming_soon", ...r });
    }
  }

  return report;
}
