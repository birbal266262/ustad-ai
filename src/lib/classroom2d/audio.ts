/**
 * Classroom voice engine — authoritative teacher-voice controller.
 *
 * TRUE RUNTIME SYNCHRONIZATION: the engine reports a truthful speech lifecycle
 * (IDLE → STARTING → SPEAKING → ENDED / FAILED / CANCELLED / UNAVAILABLE /
 * SKIPPED) instead of guessing from timers. The Master Teaching Timeline reads
 * this lifecycle through `isSpeechPending` / `lifecycleState` and never advances
 * a beat while voice is actually in flight.
 *
 * SMART TTS FAILOVER (spec §5/§19) — always automatic, never a manual choice:
 *
 *   LOVABLE TTS  →(fail)→  BROWSER TTS  →(fail)→  API MANAGER TTS
 *
 * LANGUAGE AUTHORITY (§1/§10): the classroom language selector is the ONLY
 * source of truth. Hindi speaks Hindi, English speaks English, Hinglish speaks
 * natural mixed speech — the language is never flipped because the response
 * text happens to contain another language.
 *
 * HONEST FAILURE (§6): HTTP 200 is not success. Empty/undecodable audio, zero
 * duration, blocked playback, a missing voice, a stalled request or a synthesis
 * error all count as FAILED and immediately advance to the next layer.
 *
 * STALE-CALLBACK SAFETY: every request carries a monotonic request id. Old
 * utterances/provider responses whose id no longer matches the current one are
 * dropped, so a rerender, board update, teacher animation or diagram render can
 * never start, duplicate, or cut the wrong speech.
 */
import {
  cleanForSpeech,
  pickVoiceForLanguage,
  speechLangTag,
  toClassroomLanguage,
  type ClassroomLanguage,
  type TtsProvider,
  type TtsStatus,
} from "../classroom-speech";

/**
 * Truthful speech lifecycle. The timeline treats every state distinctly:
 * - "starting"/"speaking" → the beat must keep waiting
 * - "ended"             → real successful completion
 * - "failed"            → every layer failed (error recorded, no success claim)
 * - "cancelled"         → stopSpeak()/dispose()/interruption (NOT completion)
 * - "unavailable"       → this environment has no usable TTS at all
 * - "skipped"           → speech intentionally not attempted (muted / autoSpeak off / empty)
 */
export type SpeechLifecycle =
  | "idle"
  | "starting"
  | "speaking"
  | "ended"
  | "failed"
  | "cancelled"
  | "unavailable"
  | "skipped";

export type AudioReadiness = "ready" | "blocked" | "unavailable";

/** Provider/browser requested but no audio event within this window → stalled. */
const START_STALL_MS = 12000;
/** Started playing but no completion event within this window → hung audio. */
const PLAY_HANG_MS = 60000;
/** A single stage may never block the classroom longer than this (§12). */
const STAGE_TIMEOUT_MS = 9000;
/** Browser speech must actually start speaking within this window (§6). */
const BROWSER_START_MS = 3500;

function browserTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "audio/mpeg" });
}

/** Reject a promise that takes too long, so a slow stage can never hang us. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export class AudioEngine {
  private muted = false;
  private autoSpeak = true;
  /** classroom teaching language — the ONLY source of truth for voice */
  private language: ClassroomLanguage = "english";
  /**
   * Monotonic speech request id. Incremented on EVERY speak()/stopSpeak(); every
   * utterance, provider response and media event captures the id it belongs to
   * and self-ignores when it no longer matches.
   */
  private token = 0;
  private providerAudio: HTMLAudioElement | null = null;
  private providerUrl: string | null = null;
  /** true while a provider request is in flight or audio is queued/playing */
  private pending = false;
  private disposed = false;

  private lifecycle: SpeechLifecycle = "idle";
  /** wall-clock of the request start (stall detection) */
  private requestedAt = 0;
  /** wall-clock when audio actually began playing */
  private startedAt = 0;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private browserStartTimer: ReturnType<typeof setTimeout> | null = null;
  private gestureBlocked = false;
  private lastReadiness: AudioReadiness = "ready";

  /** Cached browser voices, refreshed on voiceschanged. */
  private voiceCache: SpeechSynthesisVoice[] = [];

  /** Internal fallback state (§13) — logic/debugging only, not classroom UI. */
  private provider: TtsProvider = null;
  private status: TtsStatus = "idle";
  /** Duplicate-speech guard: same text + language while already speaking (§12). */
  private lastKey = "";

  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  /** cancellation / interruption — NEVER a completion */
  onSpeakCancel?: (reason: string) => void;
  /** provider/browser error — NEVER a completion */
  onSpeechError?: (reason: string) => void;
  onSpeechUnavailable?: (reason: string) => void;
  onReadinessChange?: (r: AudioReadiness) => void;

  constructor() {
    // Voices may arrive asynchronously — cache them and listen for the event.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const ss = window.speechSynthesis;
      const refresh = (): void => {
        try {
          this.voiceCache = [...(ss.getVoices?.() ?? [])];
        } catch {
          this.voiceCache = [];
        }
      };
      refresh();
      try {
        const prev = ss.onvoiceschanged;
        ss.onvoiceschanged = (ev) => {
          if (typeof prev === "function") prev.call(ss, ev);
          refresh();
        };
      } catch {
        /* some browsers guard this */
      }
    }
  }

  /* ------------------------- policy / language ------------------------- */

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stopSpeak("muted");
  }

  setAutoSpeak(on: boolean): void {
    this.autoSpeak = on;
    if (!on) this.stopSpeak("auto-speak disabled");
  }

  /**
   * Accepts the classroom language ("english" | "hindi" | "hinglish") and, for
   * backwards compatibility, a BCP-47 tag. A language change invalidates the
   * cached voice selection for the NEXT response (§15) — the previous language
   * is never reused.
   */
  setLang(lang: string): void {
    const next = toClassroomLanguage(lang === "hi-IN" ? "hindi" : lang === "en-IN" ? "english" : lang);
    if (next !== this.language) {
      this.language = next;
      this.lastKey = "";
      this.provider = null;
      this.status = "idle";
    }
  }

  /* ------------------------- state (truthful) ------------------------- */

  get lifecycleState(): SpeechLifecycle {
    return this.lifecycle;
  }

  /** True while the authoritative controller has an active/pending voice request. */
  get isSpeechPending(): boolean {
    return this.pending;
  }

  /** Which layer produced the current/last speech (internal only). */
  get ttsProvider(): TtsProvider {
    return this.provider;
  }

  /** Internal TTS status (idle/generating/playing/success/failed/fallback). */
  get ttsStatus(): TtsStatus {
    return this.status;
  }

  /** The classroom language currently driving voice selection. */
  get speechLanguage(): ClassroomLanguage {
    return this.language;
  }

  /** Honest audio readiness for the UI. */
  get readiness(): AudioReadiness {
    if (this.lifecycle === "unavailable") return "unavailable";
    if (this.gestureBlocked) return "blocked";
    return "ready";
  }

  private setLifecycle(state: SpeechLifecycle): void {
    this.lifecycle = state;
    const r = this.readiness;
    if (r !== this.lastReadiness) {
      this.lastReadiness = r;
      this.onReadinessChange?.(r);
    }
  }

  /* ---------------------------------------------------------------- *
   * speak() — the ONLY entry point that may start classroom speech.  *
   * ---------------------------------------------------------------- */
  speak(text: string, lang?: string): void {
    if (lang) this.setLang(lang);
    const spoken = cleanForSpeech(text, this.language);
    const key = `${this.language}:${spoken}`;
    // Duplicate guard: the same response can never be spoken twice at once.
    if (this.pending && key === this.lastKey) return;

    const token = ++this.token;
    this.clearWatch();
    this.killCurrent();
    if (this.disposed) {
      this.setLifecycle("cancelled");
      return;
    }
    // Policy states are explicit — the timeline learns "skipped", never
    // "completed", and must not wait.
    if (this.muted || !this.autoSpeak) {
      this.setLifecycle("skipped");
      return;
    }
    if (!spoken) {
      this.setLifecycle("skipped");
      return;
    }
    this.lastKey = key;
    this.pending = true;
    this.requestedAt = Date.now();
    this.startedAt = 0;
    this.gestureBlocked = false;
    this.provider = null;
    this.status = "generating";
    this.setLifecycle("starting");
    this.armStallWatch(token);
    void this.runChain(token, spoken);
  }

  /**
   * Cancellation ONLY — never reports completion.
   * pause/mute/autoSpeak-off/new-beat/dispose all arrive here.
   */
  stopSpeak(reason = "stopped"): void {
    this.token++;
    this.clearWatch();
    this.killCurrent();
    this.pending = false;
    this.lastKey = "";
    this.status = "idle";
    this.setLifecycle("cancelled");
    this.onSpeakCancel?.(reason);
  }

  private clearWatch(): void {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    if (this.browserStartTimer !== null) {
      clearTimeout(this.browserStartTimer);
      this.browserStartTimer = null;
    }
  }

  /**
   * A request that never produces an audio event must be reported as stalled —
   * the timeline then applies its explicit recovery policy. We NEVER claim
   * success for a request that never started.
   */
  private armStallWatch(token: number): void {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    if (typeof window === "undefined") return;
    this.stallTimer = setTimeout(
      () => {
        if (token !== this.token || this.disposed) return;
        if (this.lifecycle === "starting" && this.startedAt === 0) {
          this.failAll(token, "Speech synthesis stalled — no audio ever started.");
        } else if (this.lifecycle === "speaking") {
          this.pending = false;
          this.status = "failed";
          this.setLifecycle("failed");
          this.onSpeechError?.("Audio playback hung — no completion event.");
          this.onSpeechUnavailable?.("Teacher voice hung. Please pause and resume the lesson.");
        }
      },
      this.lifecycle === "speaking" ? PLAY_HANG_MS : START_STALL_MS,
    );
  }

  private killCurrent(): void {
    const a = this.providerAudio;
    if (a) {
      a.onplay = null;
      a.onended = null;
      a.onerror = null;
      a.pause();
      this.providerAudio = null;
    }
    if (this.providerUrl) {
      URL.revokeObjectURL(this.providerUrl);
      this.providerUrl = null;
    }
    if (browserTtsSupported()) window.speechSynthesis?.cancel();
  }

  /* --------------------------- failover chain --------------------------- */

  /**
   * Lovable TTS → Browser TTS → API Manager TTS, fully automatic (§5).
   * Every failure reason is collected so the final state is honest.
   */
  private async runChain(token: number, spoken: string): Promise<void> {
    const failures: string[] = [];

    // ---- Stage 1: Lovable TTS (first priority) ----
    try {
      const ok = await this.speakViaServer(token, spoken, "lovable");
      if (token !== this.token || this.disposed) return;
      if (ok) return;
      failures.push("Lovable voice: audio could not be played.");
    } catch (e) {
      if (token !== this.token || this.disposed) return;
      failures.push(`Lovable voice: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (token !== this.token || this.disposed) return;

    // ---- Stage 2: Browser TTS ----
    this.status = "fallback";
    try {
      const ok = await this.speakViaBrowser(token, spoken);
      if (token !== this.token || this.disposed) return;
      if (ok) return;
      failures.push("Browser voice: unavailable for this language.");
    } catch (e) {
      if (token !== this.token || this.disposed) return;
      failures.push(`Browser voice: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (token !== this.token || this.disposed) return;

    // ---- Stage 3: API Manager TTS (the user's own configured provider) ----
    this.status = "fallback";
    try {
      const ok = await this.speakViaServer(token, spoken, "api_manager");
      if (token !== this.token || this.disposed) return;
      if (ok) return;
      failures.push("API Manager voice: audio could not be played.");
    } catch (e) {
      if (token !== this.token || this.disposed) return;
      failures.push(`API Manager voice: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (token !== this.token || this.disposed) return;

    this.failAll(token, failures.join(" | ") || "No usable voice layer.");
  }

  /** Terminal failure for the whole chain — never a fake success (§6/TEST 6). */
  private failAll(token: number, reason: string): void {
    if (token !== this.token || this.disposed) return;
    this.clearWatch();
    this.pending = false;
    this.provider = null;
    this.status = "failed";
    this.setLifecycle(browserTtsSupported() ? "failed" : "unavailable");
    this.onSpeechError?.(reason);
    this.onSpeechUnavailable?.(
      this.gestureBlocked
        ? "Tap the classroom once to allow the teacher's voice."
        : "Teacher voice is unavailable right now. The lesson text continues on the board.",
    );
  }

  /* --------------------------- server legs --------------------------- */

  /**
   * One server-side stage: request audio, then REALLY play it. Resolves true
   * only when playback genuinely completed; false/throw means this stage failed
   * and the chain must continue.
   */
  private async speakViaServer(
    token: number,
    text: string,
    stage: "lovable" | "api_manager",
  ): Promise<boolean> {
    this.status = "generating";
    const { synthesizeFn } = await import("../ustad-api");
    const res = (await withTimeout(
      synthesizeFn({
        // token is injected by the session-safe wrapper before it is sent
        data: { token: "", text, language: this.language, stage },
      }) as Promise<{ audioBase64?: string; mime?: string; provider?: string }>,
      STAGE_TIMEOUT_MS,
      stage === "lovable" ? "Lovable voice" : "API Manager voice",
    )) as { audioBase64?: string; mime?: string; provider?: string };
    if (token !== this.token || this.disposed) return true; // stale — drop silently

    // HTTP 200 is not success: validate the audio before trusting it (§6).
    const b64 = res.audioBase64 ?? "";
    if (b64.length < 512) throw new Error("returned empty or invalid audio.");

    this.provider = stage;
    return await this.playAudio(token, b64, res.mime ?? "audio/mpeg");
  }

  /**
   * Play decoded provider audio. Resolves true on genuine completion, false
   * when the audio cannot be decoded/played (so the chain continues).
   */
  private playAudio(token: number, audioBase64: string, mime: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (value: boolean, url: string | null) => {
        if (settled) return;
        settled = true;
        if (url && this.providerUrl === url) {
          URL.revokeObjectURL(url);
          this.providerUrl = null;
        }
        this.providerAudio = null;
        resolve(value);
      };
      let url: string | null = null;
      try {
        const blob = base64ToBlob(audioBase64, mime);
        if (blob.size < 512) {
          done(false, null);
          return;
        }
        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.providerUrl = url;
        this.providerAudio = audio;
        audio.volume = 1;
        audio.onplay = () => {
          if (token !== this.token) {
            audio.pause();
            return;
          }
          this.startedAt = Date.now();
          this.gestureBlocked = false;
          this.status = "playing";
          this.setLifecycle("speaking");
          this.armStallWatch(token);
          this.onSpeakStart?.();
        };
        audio.onended = () => {
          if (token !== this.token) {
            done(true, url);
            return;
          }
          // Zero-length playback is not real speech (§6).
          if (this.startedAt === 0) {
            done(false, url);
            return;
          }
          this.clearWatch();
          this.pending = false;
          this.status = "success";
          this.setLifecycle("ended");
          this.onSpeakEnd?.();
          done(true, url);
        };
        audio.onerror = () => done(false, url);
        void audio.play().catch((err: unknown) => {
          const name = err instanceof Error ? err.name : "";
          if (name === "NotAllowedError" || name === "AbortError") this.gestureBlocked = true;
          done(false, url);
        });
      } catch {
        done(false, url);
      }
    });
  }

  /* --------------------------- browser leg --------------------------- */

  /**
   * Browser speech synthesis using a voice the device ACTUALLY exposes (§7).
   * Resolves true only when the utterance really finished; false when the
   * browser has no support, no compatible voice, or synthesis failed.
   */
  private speakViaBrowser(token: number, text: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (token !== this.token || this.disposed) {
        resolve(true);
        return;
      }
      if (!browserTtsSupported()) {
        resolve(false);
        return;
      }
      const voices = this.voiceCache.length
        ? this.voiceCache
        : [...(window.speechSynthesis.getVoices?.() ?? [])];
      const pick = pickVoiceForLanguage(voices, this.language);
      // Hindi must not be read by an English-only voice while the user's own
      // API Manager provider may still be able to speak real Hindi (§9).
      if (this.language === "hindi" && voices.length && !pick.matchesLanguage) {
        resolve(false);
        return;
      }

      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = speechLangTag(this.language, text);
      if (pick.voice) u.voice = pick.voice;
      u.rate = this.language === "hindi" ? 0.94 : 0.98;
      u.pitch = 1.02;
      u.volume = 1;

      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        if (this.browserStartTimer !== null) {
          clearTimeout(this.browserStartTimer);
          this.browserStartTimer = null;
        }
        resolve(value);
      };

      u.onstart = () => {
        if (token !== this.token) return;
        this.startedAt = Date.now();
        this.gestureBlocked = false;
        this.provider = "browser";
        this.status = "playing";
        this.setLifecycle("speaking");
        this.armStallWatch(token);
        this.onSpeakStart?.();
      };
      u.onend = () => {
        if (token !== this.token) {
          finish(true);
          return;
        }
        if (this.startedAt === 0) {
          // Ended without ever starting → the browser silently refused (§6).
          finish(false);
          return;
        }
        this.clearWatch();
        this.pending = false;
        this.status = "success";
        this.setLifecycle("ended");
        this.onSpeakEnd?.();
        finish(true);
      };
      // An error is NOT a completion — fail over instead.
      u.onerror = () => finish(false);

      try {
        window.speechSynthesis.speak(u);
      } catch {
        finish(false);
        return;
      }
      // If the browser never even starts speaking, do not wait forever (§12).
      this.browserStartTimer = setTimeout(() => {
        if (token !== this.token) return;
        if (this.startedAt === 0) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            /* ignore */
          }
          finish(false);
        }
      }, BROWSER_START_MS);
    });
  }

  /* ---------------- kept for API parity — no sound is ever generated ------- */

  sfx(_kind: "chalk" | "pop" | "chime" | "ambience"): void {
    void _kind;
  }

  startAmbience(): void {
    /* silent by design — the teacher voice is the only classroom audio */
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.token++;
    this.clearWatch();
    this.killCurrent();
    this.pending = false;
    this.status = "idle";
    // Disposal is cancellation, never successful completion.
    this.setLifecycle("cancelled");
    this.onSpeakCancel?.("disposed");
  }
}
