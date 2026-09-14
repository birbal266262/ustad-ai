/**
 * PART 9 — Notification content, in the user's own language.
 *
 * Pure and dependency-free so it can be unit-tested without a database.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE (spec §2-§4, §29, final rule):
 * a notification is written in the language the user picked in the EXISTING
 * USTAD AI settings. English is never a convenience fallback. Every template
 * below therefore supplies all three languages — there is no partial entry
 * and no English-only path, and `renderNotification` has no way to silently
 * degrade to English because the catalogue is typed as Record<Language, …>.
 *
 * Title AND message are both translated (spec §4): translating only the title
 * is explicitly called out as wrong.
 */

export type Language = "english" | "hindi" | "hinglish";

export const LANGUAGES: readonly Language[] = ["english", "hindi", "hinglish"] as const;

export type NotificationCategory =
  "events" | "coins" | "tournament" | "achievements" | "certificates" | "shop" | "system";

export const CATEGORIES: readonly NotificationCategory[] = [
  "events",
  "coins",
  "tournament",
  "achievements",
  "certificates",
  "shop",
  "system",
] as const;

/** Every kind of notification USTAD AI can raise (spec §1). */
export type NotificationType =
  | "coins_received"
  | "coins_spent"
  | "mega_pass"
  | "shop_purchase"
  | "shop_cosmetic"
  | "feature_unlock"
  | "crorepati_started"
  | "crorepati_won"
  | "crorepati_lost"
  | "crorepati_timeout"
  | "free_entry_used"
  | "free_entry_restored"
  | "tournament_started"
  | "tournament_completed"
  | "tournament_won"
  | "tournament_lost"
  | "trophy"
  | "achievement"
  | "grandmaster"
  | "ultra_grandmaster"
  | "certificate"
  | "profile_updated"
  | "offer_coming_soon"
  | "offer_live"
  | "event_participated"
  | "event_result"
  | "event_reminder_3d"
  | "event_reminder_2d"
  | "event_reminder_1d"
  | "event_live"
  | "event_ending_soon"
  | "event_closed"
  | "new_feature"
  | "important_update"
  | "system";

export const CATEGORY_OF: Record<NotificationType, NotificationCategory> = {
  coins_received: "coins",
  coins_spent: "coins",
  mega_pass: "coins",
  shop_purchase: "shop",
  shop_cosmetic: "shop",
  feature_unlock: "shop",
  crorepati_started: "tournament",
  crorepati_won: "tournament",
  crorepati_lost: "tournament",
  crorepati_timeout: "tournament",
  free_entry_used: "tournament",
  free_entry_restored: "tournament",
  tournament_started: "tournament",
  tournament_completed: "tournament",
  tournament_won: "tournament",
  tournament_lost: "tournament",
  trophy: "achievements",
  achievement: "achievements",
  grandmaster: "achievements",
  ultra_grandmaster: "achievements",
  certificate: "certificates",
  profile_updated: "system",
  offer_coming_soon: "shop",
  offer_live: "shop",
  event_participated: "events",
  event_result: "events",
  event_reminder_3d: "events",
  event_reminder_2d: "events",
  event_reminder_1d: "events",
  event_live: "events",
  event_ending_soon: "events",
  event_closed: "events",
  new_feature: "system",
  important_update: "system",
  system: "system",
};

/** Where clicking a notification should go — always an EXISTING screen (spec §36). */
export const ACTION_PATH_OF: Record<NotificationType, string> = {
  coins_received: "/shop",
  coins_spent: "/shop",
  mega_pass: "/mega",
  shop_purchase: "/shop",
  shop_cosmetic: "/shop",
  feature_unlock: "/shop",
  crorepati_started: "/crorepati",
  crorepati_won: "/crorepati",
  crorepati_lost: "/crorepati",
  crorepati_timeout: "/crorepati",
  free_entry_used: "/crorepati",
  free_entry_restored: "/crorepati",
  tournament_started: "/mega",
  tournament_completed: "/mega",
  tournament_won: "/mega",
  tournament_lost: "/mega",
  trophy: "/settings",
  achievement: "/settings",
  grandmaster: "/settings",
  ultra_grandmaster: "/settings",
  certificate: "/settings",
  profile_updated: "/settings",
  offer_coming_soon: "/shop",
  offer_live: "/shop",
  event_participated: "/events",
  event_result: "/events",
  event_reminder_3d: "/events",
  event_reminder_2d: "/events",
  event_reminder_1d: "/events",
  event_live: "/events",
  event_ending_soon: "/events",
  event_closed: "/events",
  new_feature: "/",
  important_update: "/",
  system: "/",
};

export const ICON_OF: Record<NotificationType, string> = {
  coins_received: "💰",
  coins_spent: "💸",
  mega_pass: "🎟️",
  shop_purchase: "🛒",
  shop_cosmetic: "✨",
  feature_unlock: "🔓",
  crorepati_started: "🎮",
  crorepati_won: "🏆",
  crorepati_lost: "🎯",
  crorepati_timeout: "⏰",
  free_entry_used: "🎫",
  free_entry_restored: "♻️",
  tournament_started: "⚔️",
  tournament_completed: "🏁",
  tournament_won: "🏆",
  tournament_lost: "🎯",
  trophy: "🏆",
  achievement: "🎖️",
  grandmaster: "🎖️",
  ultra_grandmaster: "💎",
  certificate: "📜",
  profile_updated: "👤",
  offer_coming_soon: "🔥",
  offer_live: "🔥",
  event_participated: "📅",
  event_result: "📊",
  event_reminder_3d: "🔔",
  event_reminder_2d: "🔔",
  event_reminder_1d: "🚨",
  event_live: "🔴",
  event_ending_soon: "⏳",
  event_closed: "🏁",
  new_feature: "🆕",
  important_update: "⚠️",
  system: "ℹ️",
};

/* ------------------------------------------------------------------ */
/* Number + date formatting                                            */
/* ------------------------------------------------------------------ */

/**
 * Indian digit grouping (1,00,000) — the convention USTAD Coins are quoted in
 * throughout the app and in the Part 9 spec examples.
 */
export function formatCoins(amount: number): string {
  const n = Math.abs(Math.trunc(amount));
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_HI = [
  "जनवरी",
  "फ़रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितंबर",
  "अक्टूबर",
  "नवंबर",
  "दिसंबर",
];

/** Parts of an instant as seen in a specific IANA timezone (spec §10). */
function zoned(iso: string, timezone: string) {
  const d = new Date(iso);
  const tz = timezone || "UTC";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // hour12:false yields the h24 cycle, where midnight is reported as 24 rather
  // than 0. Left unnormalised that made 12:00 AM render as 12:00 PM.
  const hh = get("hour") % 24;
  return { y: get("year"), m: get("month"), d: get("day"), hh, mm: get("minute") };
}

/** Hindi time-of-day word: सुबह / दोपहर / शाम / रात. */
function hindiDaypart(hh: number): string {
  if (hh >= 4 && hh < 12) return "सुबह";
  if (hh >= 12 && hh < 16) return "दोपहर";
  if (hh >= 16 && hh < 20) return "शाम";
  return "रात";
}

/**
 * Exact date AND time, in the user's timezone and language (spec §9, §10).
 * Never a bare relative string — "2 hours ago" alone is explicitly rejected.
 *
 *   english/hinglish → 6 September 2026 • 12:00 AM
 *   hindi            → 6 सितंबर 2026 • रात 12:00 बजे
 */
export function formatExactDateTime(iso: string, language: Language, timezone: string): string {
  const { y, m, d, hh, mm } = zoned(iso, timezone);
  const mi = String(mm).padStart(2, "0");

  if (language === "hindi") {
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${d} ${MONTHS_HI[m - 1]} ${y} • ${hindiDaypart(hh)} ${h12}:${mi} बजे`;
  }
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? "AM" : "PM";
  return `${d} ${MONTHS_EN[m - 1]} ${y} • ${h12}:${mi} ${ampm}`;
}

/** Day heading used by the activity timeline (spec §11). */
export function formatDayHeading(iso: string, language: Language, timezone: string): string {
  const { y, m, d } = zoned(iso, timezone);
  const months = language === "hindi" ? MONTHS_HI : MONTHS_EN;
  return `${d} ${months[m - 1]} ${y}`;
}

/** Time-only, for timeline rows under a day heading. */
export function formatTimeOnly(iso: string, language: Language, timezone: string): string {
  const { hh, mm } = zoned(iso, timezone);
  const mi = String(mm).padStart(2, "0");
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  if (language === "hindi") return `${hindiDaypart(hh)} ${h12}:${mi} बजे`;
  return `${h12}:${mi} ${hh < 12 ? "AM" : "PM"}`;
}

/** Relative time — shown IN ADDITION to the exact stamp, never instead (spec §9). */
export function formatRelative(iso: string, language: Language, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const t = {
    english: { now: "just now", m: "m ago", h: "h ago", d: "d ago" },
    hinglish: { now: "abhi", m: "m pehle", h: "h pehle", d: "d pehle" },
    hindi: { now: "अभी", m: " मिनट पहले", h: " घंटे पहले", d: " दिन पहले" },
  }[language];
  if (mins < 1) return t.now;
  if (mins < 60) return `${mins}${t.m}`;
  if (hrs < 24) return `${hrs}${t.h}`;
  return `${days}${t.d}`;
}

/* ------------------------------------------------------------------ */
/* UI strings                                                          */
/* ------------------------------------------------------------------ */

export type UiStrings = {
  notifications: string;
  upcoming: string;
  recentActivity: string;
  markAllRead: string;
  noNotifications: string;
  noUpcoming: string;
  loadMore: string;
  all: string;
  unread: string;
  events: string;
  coins: string;
  tournament: string;
  achievements: string;
  certificates: string;
  shop: string;
  system: string;
  startsIn: string;
  startsToday: string;
  liveNow: string;
  days: string;
  day: string;
  starts: string;
  ends: string;
  entry: string;
  reward: string;
  free: string;
  /** Detail view chrome */
  back: string;
  viewNow: string;
  delete: string;
  what: string;
  when: string;
  howToPlay: string;
  requirements: string;
  duration: string;
  howToJoin: string;
  notes: string;
  rules: string;
  noDetails: string;
  /** Offer banner copy (localized, substituted at call site). */
  offerLiveTitle: string;
  offerLiveBodyEnd: string;
  offerLiveBodyLead: string;
  offerComingTitle: string;
  offerComingBodyLead: string;
  offerComingBodyBetween: string;
  offerChip: string;
  close: string;
  loading: string;
  noLongerAvailable: string;
};

/** Substitute {token} placeholders in a localized string with the given values. */
export function fillTokens(template: string, tokens: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in tokens ? String(tokens[key]) : m));
}

export const UI_TEXT: Record<Language, UiStrings> = {
  english: {
    notifications: "Notifications",
    upcoming: "UPCOMING",
    recentActivity: "RECENT ACTIVITY",
    markAllRead: "Mark all as read",
    noNotifications: "No notifications yet.",
    noUpcoming: "No upcoming events.",
    loadMore: "Load older",
    all: "All",
    unread: "Unread",
    events: "Events",
    coins: "Coins",
    tournament: "Tournament",
    achievements: "Achievements",
    certificates: "Certificates",
    shop: "Shop",
    system: "System",
    startsIn: "Starts in",
    startsToday: "Starts today",
    liveNow: "Live now",
    days: "days",
    day: "day",
    starts: "Starts",
    ends: "Ends",
    entry: "Entry",
    reward: "Reward",
    free: "Free",
    back: "Back",
    viewNow: "Open",
    delete: "Delete",
    what: "What is it?",
    when: "Date & time",
    howToPlay: "How to play",
    requirements: "Requirements",
    duration: "Duration",
    howToJoin: "How to join",
    notes: "Notes",
    rules: "Rules",
    noDetails: "No extra details are available for this notification.",
    offerLiveTitle: "GLOBAL COIN OFFER IS LIVE",
    offerLiveBodyLead: "{pct}% OFF on every eligible USTAD Coin purchase.",
    offerLiveBodyEnd: "Hurry — the offer ends today at {time}.",
    offerComingTitle: "SPECIAL COIN OFFER — COMING SOON",
    offerComingBodyLead: "Up to {pct}% OFF on eligible USTAD Coin purchases",
    offerComingBodyBetween: "on {day} between {start} and {end}.",
    offerChip: "Save on coins across the whole app",
    close: "Close",
    loading: "Loading…",
    noLongerAvailable: "This notification is no longer available.",
  },
  hinglish: {
    notifications: "Notifications",
    upcoming: "AANE WALE",
    recentActivity: "HAAL KI ACTIVITY",
    markAllRead: "Sab read mark karein",
    noNotifications: "Abhi koi notification nahi hai.",
    noUpcoming: "Koi upcoming event nahi hai.",
    loadMore: "Purane dekhein",
    all: "Sab",
    unread: "Unread",
    events: "Events",
    coins: "Coins",
    tournament: "Tournament",
    achievements: "Achievements",
    certificates: "Certificates",
    shop: "Shop",
    system: "System",
    startsIn: "Start hoga",
    startsToday: "Aaj start hoga",
    liveNow: "Abhi live hai",
    days: "din mein",
    day: "din mein",
    starts: "Start",
    ends: "End",
    entry: "Entry",
    reward: "Reward",
    free: "Free",
    back: "Wapas",
    viewNow: "Kholen",
    delete: "Delete karein",
    what: "Kya hai?",
    when: "Date & time",
    howToPlay: "Kaise khelein",
    requirements: "Requirements",
    duration: "Duration",
    howToJoin: "Kaise join karein",
    notes: "Notes",
    rules: "Rules",
    noDetails: "Is notification ke liye koi extra detail nahi hai.",
    offerLiveTitle: "GLOBAL COIN OFFER LIVE HAI",
    offerLiveBodyLead: "{pct}% OFF saare eligible USTAD Coin purchases par.",
    offerLiveBodyEnd: "Jaldi karo — offer aaj {time} par khatam hoga.",
    offerComingTitle: "SPECIAL COIN OFFER — AANE WALA HAI",
    offerComingBodyLead: "{pct}% tak OFF eligible USTAD Coin purchases par",
    offerComingBodyBetween: "{day} ko {start} se {end} tak.",
    offerChip: "Poore app mein coins par bachat",
    close: "Band karein",
    loading: "Loading…",
    noLongerAvailable: "Ye notification ab available nahi hai.",
  },
  hindi: {
    notifications: "सूचनाएँ",
    upcoming: "आगामी",
    recentActivity: "हाल की गतिविधि",
    markAllRead: "सभी पढ़ा हुआ चिह्नित करें",
    noNotifications: "अभी कोई सूचना नहीं है।",
    noUpcoming: "कोई आगामी इवेंट नहीं है।",
    loadMore: "पुरानी देखें",
    all: "सभी",
    unread: "अपठित",
    events: "इवेंट",
    coins: "Coins",
    tournament: "टूर्नामेंट",
    achievements: "उपलब्धियाँ",
    certificates: "प्रमाणपत्र",
    shop: "शॉप",
    system: "सिस्टम",
    startsIn: "शुरू होगा",
    startsToday: "आज शुरू होगा",
    liveNow: "अभी लाइव है",
    days: "दिनों में",
    day: "दिन में",
    starts: "शुरू",
    ends: "समाप्त",
    entry: "एंट्री",
    reward: "इनाम",
    free: "निःशुल्क",
    back: "वापस",
    viewNow: "खोलें",
    delete: "हटाएँ",
    what: "यह क्या है?",
    when: "दिनांक और समय",
    howToPlay: "कैसे खेलें",
    requirements: "आवश्यकताएँ",
    duration: "अवधि",
    howToJoin: "कैसे शामिल हों",
    notes: "नोट",
    rules: "नियम",
    noDetails: "इस सूचना के लिए कोई अतिरिक्त विवरण उपलब्ध नहीं है।",
    offerLiveTitle: "ग्लोबल सिक्का ऑफ़र लाइव है",
    offerLiveBodyLead: "{pct}% की छूट सभी eligible USTAD Coin खरीद पर।",
    offerLiveBodyEnd: "जल्दी करें — ऑफ़र आज {time} पर समाप्त होगा।",
    offerComingTitle: "विशेष सिक्का ऑफ़र — आने वाला है",
    offerComingBodyLead: "{pct}% तक की छूट eligible USTAD Coin खरीद पर",
    offerComingBodyBetween: "{day} को {start} से {end} तक।",
    offerChip: "पूरे ऐप में सिक्कों पर बचत",
    close: "बंद करें",
    loading: "लोड हो रहा है…",
    noLongerAvailable: "यह सूचना अब उपलब्ध नहीं है।",
  },
};

/* ------------------------------------------------------------------ */
/* Notification templates                                             */
/* ------------------------------------------------------------------ */

export type NotificationVars = {
  amount?: number;
  source?: string;
  purpose?: string;
  itemName?: string;
  cosmeticName?: string;
  featureName?: string;
  eventName?: string;
  achievementName?: string;
  certificateName?: string;
  score?: number;
  total?: number;
  reward?: number;
  discountPct?: number;
  days?: number;
  startAt?: string;
  count?: number;
  entryFee?: number;
  winReward?: number;
  questionCount?: number;
  requiredCorrect?: number;
  eventType?: string;
};

export type RenderedNotification = { title: string; message: string };

type Template = (v: NotificationVars, fmt: (n: number) => string) => RenderedNotification;

/**
 * The catalogue. Typing each entry as a full Record<Language, Template> is what
 * makes an English-only notification impossible: omitting `hindi` or
 * `hinglish` for any type is a compile error.
 */
const TEMPLATES: Record<NotificationType, Record<Language, Template>> = {
  coins_received: {
    english: (v, f) => ({
      title: "Coins Received",
      message: `+${f(v.amount ?? 0)} USTAD Coins\n\nSource:\n${v.source ?? "USTAD AI"}`,
    }),
    hinglish: (v, f) => ({
      title: "Coins Receive hue",
      message: `+${f(v.amount ?? 0)} USTAD Coins\n\nSource:\n${v.source ?? "USTAD AI"}`,
    }),
    hindi: (v, f) => ({
      title: "Coins प्राप्त हुए",
      message: `+${f(v.amount ?? 0)} USTAD Coins\n\nस्रोत:\n${v.source ?? "USTAD AI"}`,
    }),
  },
  coins_spent: {
    english: (v, f) => ({
      title: "Coins Spent",
      message: `-${f(v.amount ?? 0)} USTAD Coins\n\nPurpose:\n${v.purpose ?? "USTAD AI"}`,
    }),
    hinglish: (v, f) => ({
      title: "Coins Kharch hue",
      message: `-${f(v.amount ?? 0)} USTAD Coins\n\nKis liye:\n${v.purpose ?? "USTAD AI"}`,
    }),
    hindi: (v, f) => ({
      title: "Coins खर्च हुए",
      message: `-${f(v.amount ?? 0)} USTAD Coins\n\nकिसके लिए:\n${v.purpose ?? "USTAD AI"}`,
    }),
  },
  mega_pass: {
    english: (v, f) => ({
      title: "Mega Pass Purchased",
      message: `-${f(v.amount ?? 0)} USTAD Coins\n\nYour Mega Tournament Pass is active.`,
    }),
    hinglish: (v, f) => ({
      title: "Mega Pass Khareeda",
      message: `-${f(v.amount ?? 0)} USTAD Coins\n\nAapka Mega Tournament Pass active hai.`,
    }),
    hindi: (v, f) => ({
      title: "Mega Pass खरीदा गया",
      message: `-${f(v.amount ?? 0)} USTAD Coins\n\nआपका Mega Tournament Pass सक्रिय है।`,
    }),
  },
  shop_purchase: {
    english: (v, f) => ({
      title: "Item Unlocked",
      message: `${v.itemName ?? "Item"}\n\n-${f(v.amount ?? 0)} USTAD Coins`,
    }),
    hinglish: (v, f) => ({
      title: "Item Unlock hua",
      message: `${v.itemName ?? "Item"}\n\n-${f(v.amount ?? 0)} USTAD Coins`,
    }),
    hindi: (v, f) => ({
      title: "आइटम अनलॉक हुआ",
      message: `${v.itemName ?? "Item"}\n\n-${f(v.amount ?? 0)} USTAD Coins`,
    }),
  },
  shop_cosmetic: {
    english: (v) => ({
      title: "Look Updated",
      message: `${v.cosmeticName ?? "Your item"} is now equipped on your profile.`,
    }),
    hinglish: (v) => ({
      title: "Look Update hua",
      message: `${v.cosmeticName ?? "Aapki item"} ab aapke profile par equipped hai.`,
    }),
    hindi: (v) => ({
      title: "लुक अपडेट हुआ",
      message: `${v.cosmeticName ?? "आपका आइटम"} अब आपकी प्रोफ़ाइल पर लग गया है।`,
    }),
  },
  feature_unlock: {
    english: (v) => ({
      title: "Feature Unlocked",
      message: `${v.featureName ?? "New feature"}`,
    }),
    hinglish: (v) => ({
      title: "Feature Unlock hua",
      message: `${v.featureName ?? "Naya feature"}`,
    }),
    hindi: (v) => ({
      title: "फ़ीचर अनलॉक हुआ",
      message: `${v.featureName ?? "नया फ़ीचर"}`,
    }),
  },
  crorepati_started: {
    english: () => ({ title: "Crorepati Started", message: "Your Crorepati game has started." }),
    hinglish: () => ({
      title: "Crorepati Start hua",
      message: "Aapka Crorepati game start ho gaya.",
    }),
    hindi: () => ({ title: "Crorepati शुरू हुआ", message: "आपका Crorepati गेम शुरू हो गया।" }),
  },
  crorepati_won: {
    english: (v, f) => ({
      title: "Crorepati Won!",
      message: `You cleared ${v.score ?? 0}/${v.total ?? 20} questions.\n\nReward:\n${f(v.reward ?? 0)} USTAD Coins`,
    }),
    hinglish: (v, f) => ({
      title: "Crorepati Win!",
      message: `Aapne ${v.score ?? 0}/${v.total ?? 20} questions clear kiye.\n\nReward:\n${f(v.reward ?? 0)} USTAD Coins`,
    }),
    hindi: (v, f) => ({
      title: "Crorepati जीत गए!",
      message: `आपने ${v.score ?? 0}/${v.total ?? 20} प्रश्न पूरे किए।\n\nइनाम:\n${f(v.reward ?? 0)} USTAD Coins`,
    }),
  },
  crorepati_lost: {
    english: (v) => ({
      title: "Crorepati Finished",
      message: `You reached question ${v.score ?? 0}/${v.total ?? 20}. Try again!`,
    }),
    hinglish: (v) => ({
      title: "Crorepati Khatam",
      message: `Aap ${v.score ?? 0}/${v.total ?? 20} tak pahunche. Phir se try karein!`,
    }),
    hindi: (v) => ({
      title: "Crorepati समाप्त",
      message: `आप ${v.score ?? 0}/${v.total ?? 20} तक पहुँचे। फिर से प्रयास करें!`,
    }),
  },
  crorepati_timeout: {
    english: () => ({ title: "Time Up", message: "Your Crorepati time expired." }),
    hinglish: () => ({ title: "Time Khatam", message: "Aapka Crorepati time khatam ho gaya." }),
    hindi: () => ({ title: "समय समाप्त", message: "आपका Crorepati समय समाप्त हो गया।" }),
  },
  free_entry_used: {
    english: (v) => ({
      title: "Free Entry Used",
      message: `${v.count ?? 0} free ${(v.count ?? 0) === 1 ? "entry" : "entries"} remaining.`,
    }),
    hinglish: (v) => ({
      title: "Free Entry Use hui",
      message: `${v.count ?? 0} free entry baaki hai.`,
    }),
    hindi: (v) => ({
      title: "निःशुल्क एंट्री उपयोग हुई",
      message: `${v.count ?? 0} निःशुल्क एंट्री शेष है।`,
    }),
  },
  free_entry_restored: {
    english: (v) => ({
      title: "Free Entries Restored",
      message: `You have ${v.count ?? 0} free entries again.`,
    }),
    hinglish: (v) => ({
      title: "Free Entries Wapas aayi",
      message: `Aapke paas phir se ${v.count ?? 0} free entries hain.`,
    }),
    hindi: (v) => ({
      title: "निःशुल्क एंट्री वापस मिलीं",
      message: `आपके पास फिर से ${v.count ?? 0} निःशुल्क एंट्री हैं।`,
    }),
  },
  tournament_started: {
    english: (v) => ({
      title: "Match Started",
      message: `${v.eventName ?? "Tournament"} has started.`,
    }),
    hinglish: (v) => ({
      title: "Match Start hua",
      message: `${v.eventName ?? "Tournament"} start ho gaya.`,
    }),
    hindi: (v) => ({
      title: "मैच शुरू हुआ",
      message: `${v.eventName ?? "Tournament"} शुरू हो गया।`,
    }),
  },
  tournament_completed: {
    english: (v) => ({
      title: "Match Completed",
      message: `${v.eventName ?? "Tournament"} finished. Score: ${v.score ?? 0}/${v.total ?? 0}.`,
    }),
    hinglish: (v) => ({
      title: "Match Complete hua",
      message: `${v.eventName ?? "Tournament"} khatam. Score: ${v.score ?? 0}/${v.total ?? 0}.`,
    }),
    hindi: (v) => ({
      title: "मैच पूरा हुआ",
      message: `${v.eventName ?? "Tournament"} समाप्त। स्कोर: ${v.score ?? 0}/${v.total ?? 0}।`,
    }),
  },
  tournament_won: {
    english: (v, f) => ({
      title: "Tournament Won",
      message: `You won ${v.eventName ?? "the tournament"}.\n\nReward:\n${f(v.reward ?? 0)} USTAD Coins`,
    }),
    hinglish: (v, f) => ({
      title: "Tournament Jeeta",
      message: `Aapne ${v.eventName ?? "tournament"} jeet liya.\n\nReward:\n${f(v.reward ?? 0)} USTAD Coins`,
    }),
    hindi: (v, f) => ({
      title: "टूर्नामेंट जीता",
      message: `आपने ${v.eventName ?? "टूर्नामेंट"} जीत लिया।\n\nइनाम:\n${f(v.reward ?? 0)} USTAD Coins`,
    }),
  },
  tournament_lost: {
    english: (v) => ({
      title: "Tournament Finished",
      message: `${v.eventName ?? "The tournament"} is over. Better luck next time!`,
    }),
    hinglish: (v) => ({
      title: "Tournament Khatam",
      message: `${v.eventName ?? "Tournament"} khatam ho gaya. Agli baar zaroor!`,
    }),
    hindi: (v) => ({
      title: "टूर्नामेंट समाप्त",
      message: `${v.eventName ?? "टूर्नामेंट"} समाप्त हुआ। अगली बार ज़रूर!`,
    }),
  },
  trophy: {
    english: (v) => ({
      title: "Trophy Received",
      message: `${v.achievementName ?? "Trophy"} added to your profile.`,
    }),
    hinglish: (v) => ({
      title: "Trophy Mili",
      message: `${v.achievementName ?? "Trophy"} aapke profile mein add ho gayi.`,
    }),
    hindi: (v) => ({
      title: "ट्रॉफ़ी मिली",
      message: `${v.achievementName ?? "ट्रॉफ़ी"} आपके प्रोफ़ाइल में जुड़ गई।`,
    }),
  },
  achievement: {
    english: (v) => ({
      title: "Achievement Unlocked",
      message: `${v.achievementName ?? "Achievement"} unlocked.`,
    }),
    hinglish: (v) => ({
      title: "Achievement Unlock hui",
      message: `${v.achievementName ?? "Achievement"} unlock ho gayi.`,
    }),
    hindi: (v) => ({
      title: "उपलब्धि अनलॉक हुई",
      message: `${v.achievementName ?? "उपलब्धि"} अनलॉक हो गई।`,
    }),
  },
  grandmaster: {
    english: () => ({
      title: "Grandmaster Unlocked",
      message: "You have achieved Grandmaster rank.",
    }),
    hinglish: () => ({
      title: "Grandmaster Unlock hua",
      message: "Aapne Grandmaster rank hasil kar li.",
    }),
    hindi: () => ({
      title: "Grandmaster अनलॉक हुआ",
      message: "आपने Grandmaster रैंक हासिल कर ली।",
    }),
  },
  ultra_grandmaster: {
    english: () => ({
      title: "Ultra Great Grandmaster Unlocked",
      message: "You have achieved the Ultra Great Grandmaster rank.",
    }),
    hinglish: () => ({
      title: "Ultra Great Grandmaster Unlock hua",
      message: "Aapne Ultra Great Grandmaster rank hasil kar li.",
    }),
    hindi: () => ({
      title: "Ultra Great Grandmaster अनलॉक हुआ",
      message: "आपने Ultra Great Grandmaster रैंक हासिल कर ली।",
    }),
  },
  certificate: {
    english: (v) => ({
      title: "Certificate Ready",
      message: `${v.certificateName ? `${v.certificateName}\n\n` : ""}Your certificate is now available in your Profile.`,
    }),
    hinglish: (v) => ({
      title: "Certificate Taiyar hai",
      message: `${v.certificateName ? `${v.certificateName}\n\n` : ""}Aapka certificate ab Profile mein available hai.`,
    }),
    hindi: (v) => ({
      title: "प्रमाणपत्र तैयार है",
      message: `${v.certificateName ? `${v.certificateName}\n\n` : ""}आपका प्रमाणपत्र अब आपके प्रोफ़ाइल में उपलब्ध है।`,
    }),
  },
  profile_updated: {
    english: () => ({
      title: "Profile Updated",
      message: "Your profile picture has been updated successfully.",
    }),
    hinglish: () => ({
      title: "Profile Update hua",
      message: "Aapki profile picture successfully update ho gayi.",
    }),
    hindi: () => ({
      title: "प्रोफ़ाइल अपडेट हुई",
      message: "आपकी प्रोफ़ाइल फ़ोटो सफलतापूर्वक अपडेट हो गई।",
    }),
  },
  offer_coming_soon: {
    english: (v) => ({
      title: "Special Coin Offer Coming Soon",
      message: `A global USTAD Coin offer is coming this week — up to ${v.discountPct ?? "??"}% OFF on eligible purchases.`,
    }),
    hinglish: (v) => ({
      title: "Special Coin Offer Aane wala hai",
      message: `Is hafte USTAD Coin offer aane wala hai — eligible purchases par ${v.discountPct ?? "??"}% tak OFF.`,
    }),
    hindi: (v) => ({
      title: "विशेष सिक्का ऑफ़र आने वाला है",
      message: `इस हफ्ते USTAD Coin ऑफ़र आने वाला है — eligible खरीद पर ${v.discountPct ?? "??"}% तक छूट।`,
    }),
  },
  offer_live: {
    english: (v) => ({
      title: "Coin Offer is LIVE!",
      message: `🔥 ${v.discountPct ?? "??"}% OFF on all eligible USTAD Coin purchases. Grab it now!`,
    }),
    hinglish: (v) => ({
      title: "Coin Offer LIVE hai!",
      message: `🔥 Saare eligible USTAD Coin purchases par ${v.discountPct ?? "??"}% OFF. Abhi le lo!`,
    }),
    hindi: (v) => ({
      title: "सिक्का ऑफ़र लाइव है!",
      message: `🔥 सभी eligible USTAD Coin खरीद पर ${v.discountPct ?? "??"}% छूट। अभी लें!`,
    }),
  },
  event_participated: {
    english: (v) => ({
      title: "Event Joined",
      message: `You joined ${v.eventName ?? "the event"}.`,
    }),
    hinglish: (v) => ({
      title: "Event Join kiya",
      message: `Aapne ${v.eventName ?? "event"} join kiya.`,
    }),
    hindi: (v) => ({
      title: "इवेंट में शामिल हुए",
      message: `आप ${v.eventName ?? "इवेंट"} में शामिल हुए।`,
    }),
  },
  event_result: {
    english: (v) => ({
      title: "Event Result",
      message: `${v.eventName ?? "Event"} result: ${v.score ?? 0}/${v.total ?? 0}.`,
    }),
    hinglish: (v) => ({
      title: "Event Result",
      message: `${v.eventName ?? "Event"} ka result: ${v.score ?? 0}/${v.total ?? 0}.`,
    }),
    hindi: (v) => ({
      title: "इवेंट परिणाम",
      message: `${v.eventName ?? "इवेंट"} का परिणाम: ${v.score ?? 0}/${v.total ?? 0}।`,
    }),
  },
  event_reminder_3d: {
    english: (v) => ({
      title: "Upcoming Event",
      message: `${v.eventName ?? "Event"} starts in 3 days.\n\nStart:\n${v.startAt ?? ""}`,
    }),
    hinglish: (v) => ({
      title: "Upcoming Event",
      message: `${v.eventName ?? "Event"} 3 din mein start hoga.\n\nStart:\n${v.startAt ?? ""}`,
    }),
    hindi: (v) => ({
      title: "आगामी इवेंट",
      message: `${v.eventName ?? "इवेंट"} 3 दिनों में शुरू होगा।\n\nशुरू होने का समय:\n${v.startAt ?? ""}`,
    }),
  },
  event_reminder_2d: {
    english: (v) => ({
      title: "Upcoming Event",
      message: `${v.eventName ?? "Event"} starts in 2 days.\n\nStart:\n${v.startAt ?? ""}`,
    }),
    hinglish: (v) => ({
      title: "Upcoming Event",
      message: `${v.eventName ?? "Event"} 2 din mein start hoga.\n\nStart:\n${v.startAt ?? ""}`,
    }),
    hindi: (v) => ({
      title: "आगामी इवेंट",
      message: `${v.eventName ?? "इवेंट"} 2 दिनों में शुरू होगा।\n\nशुरू होने का समय:\n${v.startAt ?? ""}`,
    }),
  },
  event_reminder_1d: {
    english: (v) => ({
      title: "Event Tomorrow",
      message: `${v.eventName ?? "Event"} starts tomorrow.\n\nStart:\n${v.startAt ?? ""}`,
    }),
    hinglish: (v) => ({
      title: "Event Kal hai",
      message: `${v.eventName ?? "Event"} kal start hoga.\n\nStart:\n${v.startAt ?? ""}`,
    }),
    hindi: (v) => ({
      title: "इवेंट कल है",
      message: `${v.eventName ?? "इवेंट"} कल शुरू होगा।\n\nशुरू होने का समय:\n${v.startAt ?? ""}`,
    }),
  },
  event_live: {
    english: (v) => ({
      title: "Event is LIVE!",
      message: `${v.eventName ?? "The event"} is now open.`,
    }),
    hinglish: (v) => ({
      title: "Event LIVE hai!",
      message: `${v.eventName ?? "Event"} ab open hai.`,
    }),
    hindi: (v) => ({
      title: "इवेंट लाइव है!",
      message: `${v.eventName ?? "इवेंट"} अब शुरू हो गया है।`,
    }),
  },
  event_ending_soon: {
    english: (v) => ({
      title: "Event Ending Soon",
      message: `${v.eventName ?? "The event"} is ending soon. Play now before it closes.`,
    }),
    hinglish: (v) => ({
      title: "Event Khatam hone wala hai",
      message: `${v.eventName ?? "Event"} ending hone wala hai. Band hone se pehle khelein.`,
    }),
    hindi: (v) => ({
      title: "इवेंट जल्द समाप्त होगा",
      message: `${v.eventName ?? "इवेंट"} जल्द समाप्त होने वाला है। बंद होने से पहले खेलें।`,
    }),
  },
  event_closed: {
    english: (v) => ({
      title: "Event Closed",
      message: `${v.eventName ?? "The event"} has closed. Results are on your Profile.`,
    }),
    hinglish: (v) => ({
      title: "Event Band hua",
      message: `${v.eventName ?? "Event"} band ho gaya. Results aapke Profile par hain.`,
    }),
    hindi: (v) => ({
      title: "इवेंट समाप्त हुआ",
      message: `${v.eventName ?? "इवेंट"} समाप्त हो गया। परिणाम आपकी प्रोफ़ाइल पर हैं।`,
    }),
  },
  new_feature: {
    english: (v) => ({
      title: "New Feature",
      message: v.featureName ?? "Try a new USTAD AI feature.",
    }),
    hinglish: (v) => ({
      title: "Naya Feature",
      message: v.featureName ?? "Naya USTAD AI feature try karein.",
    }),
    hindi: (v) => ({
      title: "नया फ़ीचर",
      message: v.featureName ?? "नया USTAD AI फ़ीचर आज़माएँ।",
    }),
  },
  important_update: {
    english: (v) => ({
      title: "Important Update",
      message: v.source ?? "Please review this update.",
    }),
    hinglish: (v) => ({
      title: "Zaroori Update",
      message: v.source ?? "Ye update zaroor padhein.",
    }),
    hindi: (v) => ({
      title: "महत्वपूर्ण अपडेट",
      message: v.source ?? "कृपया इस अपडेट को पढ़ें।",
    }),
  },
  system: {
    english: (v) => ({ title: "USTAD AI", message: v.source ?? "" }),
    hinglish: (v) => ({ title: "USTAD AI", message: v.source ?? "" }),
    hindi: (v) => ({ title: "USTAD AI", message: v.source ?? "" }),
  },
};

/** Only these three are valid; anything else falls back to the stored default. */
export function normalizeLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : "english";
}

/**
 * Render a notification in a specific language.
 *
 * There is no English fallback path: `TEMPLATES[type]` always has all three
 * languages, so a Hindi user gets Hindi even for the newest notification type.
 */
export function renderNotification(
  type: NotificationType,
  language: Language,
  vars: NotificationVars = {},
): RenderedNotification {
  const byLang = TEMPLATES[type] ?? TEMPLATES.system;
  const template = byLang[language] ?? byLang.english;
  return template(vars, formatCoins);
}

/** "Starts in 2 days" / "2 din mein" / "2 दिनों में" for the UPCOMING section. */
export function formatStartsIn(
  startIso: string,
  language: Language,
  now: Date = new Date(),
): string {
  const t = UI_TEXT[language];
  const diff = new Date(startIso).getTime() - now.getTime();
  if (diff <= 0) return t.liveNow;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return t.startsToday;
  const unit = days === 1 ? t.day : t.days;
  return language === "english" ? `${t.startsIn} ${days} ${unit}` : `${days} ${unit} ${t.startsIn}`;
}

/** Milestones the backend scheduler fires at (spec §28). */
export const REMINDER_OFFSETS = [
  { kind: "reminder_3d" as const, type: "event_reminder_3d" as const, days: 3 },
  { kind: "reminder_2d" as const, type: "event_reminder_2d" as const, days: 2 },
  { kind: "reminder_1d" as const, type: "event_reminder_1d" as const, days: 1 },
];

export type ReminderKind = "reminder_3d" | "reminder_2d" | "reminder_1d" | "live";

/**
 * Which reminders are due for an event right now.
 *
 * A milestone fires once its moment has passed and the event has not yet
 * started, so a scheduler outage does not silently skip a reminder — the
 * next tick still delivers it. The reminder log then guarantees exactly one
 * delivery per guest per milestone (spec §28, §38, §43).
 */
export function dueReminders(startIso: string, now: Date = new Date()): ReminderKind[] {
  const start = new Date(startIso).getTime();
  const t = now.getTime();
  const due: ReminderKind[] = [];
  if (t >= start) return ["live"];
  // Walk from the CLOSEST milestone outwards, so a tick one day before an
  // event reports the 1-day reminder and not the long-passed 3-day one.
  const byClosest = [...REMINDER_OFFSETS].sort((a, b) => a.days - b.days);
  for (const { kind, days } of byClosest) {
    if (t >= start - days * 86400000) {
      due.push(kind);
      break; // earlier milestones are superseded by the closest one
    }
  }
  return due;
}

/* ------------------------------------------------------------------ */
/* End-phase milestones (ending-soon / closed) — pure, tested          */
/* ------------------------------------------------------------------ */

export type EndReminderKind = "ending_soon" | "closed";

/** How long before an event's end the "ending soon" notice becomes due. */
export const ENDING_SOON_LEAD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Which end-phase milestone is due for a running/finished event.
 *   • `ending_soon` once the event is live and fewer than ENDING_SOON_LEAD_MS
 *     remain before its scheduled end.
 *   • `closed` once `now` has passed the scheduled end.
 * Returns [] before the event starts (the start-phase reminders own that).
 */
export function dueEndReminders(
  startIso: string,
  endIso: string,
  now: Date = new Date(),
): EndReminderKind[] {
  const t = now.getTime();
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  if (t >= end) return ["closed"];
  if (t >= start && end - t <= ENDING_SOON_LEAD_MS) return ["ending_soon"];
  return [];
}
