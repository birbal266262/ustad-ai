/**
 * REAL browser / system notification delivery — an ADDITIONAL channel on top of
 * the existing USTAD AI notification + reminder systems.
 *
 * Nothing here creates, stores or replaces a notification: the existing
 * server-side notification pipeline stays the single source of truth. This
 * module only mirrors an already-created notification to the operating system
 * when the user has explicitly allowed it.
 *
 * Rules honoured here:
 *  - The REAL `Notification.requestPermission()` is used. Permission is never
 *    faked, assumed or bypassed.
 *  - Delivery is de-duplicated per guest by notification id, so one event can
 *    never fire two or more system notifications.
 *  - Every failure is silent for the app: in-app notifications and reminders
 *    keep working exactly as before.
 */

export type BrowserPermission = "unsupported" | "default" | "granted" | "denied";

export type BrowserNotifyStatus =
  | "ok"
  | "unsupported"
  | "needs-top-level" // cross-origin preview iframe: browsers refuse the prompt
  | "denied";

const PREF_PREFIX = "ustad.browser-notify.enabled.";
const SENT_PREFIX = "ustad.browser-notify.sent.";
const SENT_CAP = 300;

/* ------------------------------------------------------------------ */
/* capability                                                          */
/* ------------------------------------------------------------------ */

export function browserNotifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function inCrossOriginFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export function browserPermission(): BrowserPermission {
  if (!browserNotifySupported()) return "unsupported";
  return window.Notification.permission as BrowserPermission;
}

/** Ask the REAL browser for permission. Never simulated. */
export async function requestBrowserPermission(): Promise<BrowserNotifyStatus> {
  if (!browserNotifySupported()) return "unsupported";
  if (window.Notification.permission === "granted") return "ok";
  if (window.Notification.permission === "denied") return "denied";
  if (inCrossOriginFrame()) return "needs-top-level";
  try {
    const result = await window.Notification.requestPermission();
    if (result === "granted") return "ok";
    return result === "denied" ? "denied" : "needs-top-level";
  } catch {
    return "needs-top-level";
  }
}

/* ------------------------------------------------------------------ */
/* per-guest preference (survives refresh / reopen)                     */
/* ------------------------------------------------------------------ */

export function getBrowserNotifyEnabled(guestId: string): boolean {
  if (typeof window === "undefined" || !guestId) return false;
  try {
    return window.localStorage.getItem(PREF_PREFIX + guestId) === "1";
  } catch {
    return false;
  }
}

export function setBrowserNotifyEnabled(guestId: string, on: boolean): void {
  if (typeof window === "undefined" || !guestId) return;
  try {
    window.localStorage.setItem(PREF_PREFIX + guestId, on ? "1" : "0");
  } catch {
    /* storage disabled — the toggle simply won't persist */
  }
}

/* ------------------------------------------------------------------ */
/* de-duplication: one notification → at most one system notification   */
/* ------------------------------------------------------------------ */

function sentIds(guestId: string): string[] {
  if (typeof window === "undefined" || !guestId) return [];
  try {
    const raw = window.localStorage.getItem(SENT_PREFIX + guestId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Returns true the FIRST time an id is seen; false on every later call. */
export function claimDelivery(guestId: string, id: string): boolean {
  if (typeof window === "undefined" || !guestId || !id) return false;
  const list = sentIds(guestId);
  if (list.includes(id)) return false;
  list.push(id);
  try {
    window.localStorage.setItem(
      SENT_PREFIX + guestId,
      JSON.stringify(list.slice(-SENT_CAP)),
    );
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Seed the de-dup store without delivering anything. Used the first time a
 * guest enables browser notifications so the whole existing backlog does not
 * arrive at once.
 */
export function seedDelivered(guestId: string, ids: string[]): void {
  if (typeof window === "undefined" || !guestId) return;
  const merged = [...sentIds(guestId), ...ids.map(String)];
  try {
    window.localStorage.setItem(
      SENT_PREFIX + guestId,
      JSON.stringify(Array.from(new Set(merged)).slice(-SENT_CAP)),
    );
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* delivery                                                            */
/* ------------------------------------------------------------------ */

export type BrowserNotifyPayload = {
  /** Stable tag: identical tags collapse instead of stacking duplicates. */
  tag: string;
  title: string;
  body?: string;
  /** In-app path opened when the system notification is clicked. */
  path?: string;
};

/** Honest result of one delivery attempt — never a fake success. */
export type BrowserDelivery = {
  ok: boolean;
  /** How it was delivered (or attempted). */
  via: "service-worker" | "page" | "none";
  /** Real reason when `ok` is false. */
  reason?: "unsupported" | "not-granted" | "sw-failed" | "page-failed";
  error?: string;
};

/**
 * Wait (briefly) for an ACTIVE service worker registration. Chrome on Android
 * refuses page-level `new Notification()`, so the SW path is the only reliable
 * one there; before this the code used `getRegistration()` which returns
 * undefined while the worker is still installing, so early notifications fell
 * back to the page constructor and were silently dropped.
 */
async function activeRegistration(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    const ready = navigator.serviceWorker.ready;
    const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return (await Promise.race([ready, timer])) ?? existing ?? null;
  } catch {
    return null;
  }
}

/**
 * Show a real system notification. Prefers the service worker (required by
 * Chrome on Android and the only path that survives a backgrounded tab), and
 * falls back to the page-level Notification constructor. The result reports
 * exactly what happened so the UI never claims a delivery that did not occur.
 */
export async function showBrowserNotification(p: BrowserNotifyPayload): Promise<BrowserDelivery> {
  if (!browserNotifySupported()) return { ok: false, via: "none", reason: "unsupported" };
  if (window.Notification.permission !== "granted")
    return { ok: false, via: "none", reason: "not-granted" };

  const options: NotificationOptions = {
    body: p.body ?? "",
    tag: p.tag,
    icon: "/icons/ustad-192.png",
    badge: "/icons/ustad-192.png",
    data: { path: p.path ?? "/", tag: p.tag },
  };

  let swError = "";
  const reg = await activeRegistration();
  if (reg?.showNotification) {
    try {
      await reg.showNotification(p.title, options);
      return { ok: true, via: "service-worker" };
    } catch (e) {
      swError = (e as Error)?.message ?? "service worker notification failed";
    }
  }

  try {
    const n = new window.Notification(p.title, options);
    n.onclick = () => {
      try {
        window.focus();
        if (p.path) window.location.assign(p.path);
      } catch {
        /* ignore */
      }
      n.close();
    };
    return { ok: true, via: "page" };
  } catch (e) {
    return {
      ok: false,
      via: reg ? "service-worker" : "page",
      reason: reg ? "sw-failed" : "page-failed",
      error: swError || (e as Error)?.message || "",
    };
  }
}

/**
 * Deliver a REAL test notification and report honestly whether the operating
 * system accepted it. Never marks itself delivered when the browser refused.
 */
export async function sendTestNotification(): Promise<BrowserDelivery> {
  if (!browserNotifySupported()) return { ok: false, via: "none", reason: "unsupported" };
  if (window.Notification.permission !== "granted") {
    const status = await requestBrowserPermission();
    if (status !== "ok")
      return { ok: false, via: "none", reason: status === "denied" ? "not-granted" : "unsupported" };
  }
  return showBrowserNotification({
    tag: `ustad-test-${Date.now()}`,
    title: "USTAD AI",
    body: "Browser notification working ✅",
    path: "/",
  });
}


/* ------------------------------------------------------------------ */
/* copy (follows the existing Settings language)                       */
/* ------------------------------------------------------------------ */

export type BnLanguage = "english" | "hindi" | "hinglish";

export const BN_TEXT: Record<BnLanguage, Record<string, string>> = {
  english: {
    label: "Browser Notification",
    on: "ON",
    off: "OFF",
    denied: "Blocked in this browser. Allow notifications in site settings.",
    unsupported: "This browser does not support notifications.",
    topLevel: "Open USTAD AI in its own tab to allow notifications.",
  },
  hinglish: {
    label: "Browser Notification",
    on: "ON",
    off: "OFF",
    denied: "Browser ne block kiya hai. Site settings me allow karein.",
    unsupported: "Is browser me notification support nahi hai.",
    topLevel: "Allow karne ke liye USTAD AI ko apne tab me kholein.",
  },
  hindi: {
    label: "ब्राउज़र सूचना",
    on: "चालू",
    off: "बंद",
    denied: "ब्राउज़र ने रोक दिया है। साइट सेटिंग्स में अनुमति दें।",
    unsupported: "इस ब्राउज़र में सूचना समर्थित नहीं है।",
    topLevel: "अनुमति देने के लिए USTAD AI को अलग टैब में खोलें।",
  },
};
