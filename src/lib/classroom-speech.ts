/**
 * CLASSROOM SMART TTS — language authority + speech-only text cleaner.
 *
 * This module is pure (no DOM, no network) so it can be unit-tested and reused
 * by the classroom audio engine. It does NOT touch the visible classroom text:
 * everything here produces a speech-ONLY string for the TTS layer.
 *
 * Rules honoured:
 *  - The classroom language selector is the ONLY source of truth. Text sniffing
 *    can never flip Hindi to English or English to Hindi (§1/§10).
 *  - Hindi stays in Devanagari, with Hindi words for maths symbols, so a Hindi
 *    lesson is never read out with English filler (§2/§9).
 *  - Markdown, JSON, metadata, UI labels, ids, URLs and emojis are removed
 *    before speaking, while real educational content, numbers and terminology
 *    are preserved (§8/§11).
 *  - Browser voices are chosen from what the device ACTUALLY exposes; a voice is
 *    never assumed to exist (§7).
 */
import { normalizeForSpeech } from "./speech-normalize";

export type ClassroomLanguage = "english" | "hindi" | "hinglish";

/** Internal fallback state (§13) — debugging/logic only, never UI copy. */
export type TtsProvider = "lovable" | "browser" | "api_manager" | null;
export type TtsStatus =
  | "idle"
  | "generating"
  | "playing"
  | "success"
  | "failed"
  | "fallback";

const DEVANAGARI = /[\u0900-\u097F]/;

/** Normalise any stored/legacy language value to a classroom language. */
export function toClassroomLanguage(value: unknown): ClassroomLanguage {
  const v = String(value ?? "").toLowerCase();
  if (v === "hindi" || v === "hi" || v === "hi-in") return "hindi";
  if (v === "hinglish") return "hinglish";
  return "english";
}

/**
 * BCP-47 tag for the selected classroom language. The tag follows the SELECTED
 * language, never the response text — Hindi never silently becomes English.
 * Hinglish speaks best on an Indian-English voice, which pronounces both the
 * Hindi words and the English terms of a mixed sentence naturally; when a
 * Hinglish response is actually written in Devanagari, Hindi is used instead.
 */
export function speechLangTag(language: ClassroomLanguage, text = ""): string {
  if (language === "hindi") return "hi-IN";
  if (language === "hinglish") return DEVANAGARI.test(text) ? "hi-IN" : "en-IN";
  return "en-IN";
}

/** True when the pair "classroom language ↔ TTS tag" is consistent (§10). */
export function langTagMatches(language: ClassroomLanguage, tag: string): boolean {
  const t = tag.replace("_", "-").toLowerCase();
  if (language === "hindi") return t.startsWith("hi");
  if (language === "english") return t.startsWith("en");
  return t.startsWith("hi") || t.startsWith("en");
}

/* ------------------------------------------------------------------ */
/* speech-only text cleaner                                            */
/* ------------------------------------------------------------------ */

/** Maths/symbol words for Hindi so a Hindi lesson never speaks English filler. */
const HINDI_SYMBOL_WORDS: Array<[RegExp, string]> = [
  [/->|→/g, " देता है "],
  [/⇒/g, " इसका मतलब "],
  [/×|·|\*(?=\s*\d)/g, " गुणा "],
  [/÷/g, " भाग "],
  [/−|(?<=\d)\s-\s(?=\d)/g, " घटा "],
  [/(?<=[\d)])\s*\+\s*(?=[\d(])/g, " जोड़ "],
  [/=/g, " बराबर "],
  [/≈/g, " लगभग "],
  [/≠/g, " बराबर नहीं "],
  [/≤/g, " से कम या बराबर "],
  [/≥/g, " से ज़्यादा या बराबर "],
  [/±/g, " धन या ऋण "],
  [/√/g, " वर्गमूल "],
  [/%/g, " प्रतिशत "],
  [/°\s*C\b/g, " डिग्री सेल्सियस "],
  [/°/g, " डिग्री "],
];

/** Structural noise that must never be spoken, in any language. */
function stripNonSpeech(input: string): string {
  return (
    input
      // fenced code + JSON/metadata blobs
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*[{[][\s\S]{0,4000}?[}\]]\s*$/gm, " ")
      .replace(/"[a-zA-Z_][\w-]*"\s*:\s*("[^"]*"|-?\d+(\.\d+)?|true|false|null)\s*,?/g, " ")
      // internal ids / metadata / debug markers
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ")
      .replace(/\b(guest|session|request|message|beat|step|token|trace)[-_]?id\s*[:=]\s*\S+/gi, " ")
      .replace(/\[\[[\s\S]*?\]\]/g, " ")
      .replace(/<[^>\n]{1,200}>/g, " ")
      // UI / system labels that belong to the interface, not the lesson
      .replace(
        /^\s*(?:\[)?(?:system|assistant|user|note to self|debug|todo|ui|button|tap|click|press)\b\s*:?\s*(?:\])?/gim,
        " ",
      )
      // links and citations
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1")
      .replace(/\((?:source|ref|citation)[^)]*\)/gi, " ")
      .replace(/https?:\/\/\S+|www\.\S+/g, " ")
      // emojis / pictographs
      .replace(
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu,
        " ",
      )
      // markdown leftovers + speakable punctuation tidy-up
      .replace(/^\s*#{1,6}\s*/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*[-*+•]\s+/gm, "")
      .replace(/(\*\*|__|~~)/g, "")
      .replace(/[|]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
  );
}

/**
 * Build the speech-only version of a classroom response.
 * The visible classroom text is never modified — this output is used purely as
 * TTS input.
 */
export function cleanForSpeech(raw: string, language: ClassroomLanguage): string {
  let text = String(raw ?? "");
  if (!text.trim()) return "";
  text = stripNonSpeech(text);
  if (language === "hindi") {
    // Replace symbols with Hindi words BEFORE the shared normaliser, so the
    // English words it would otherwise insert never enter a Hindi sentence.
    for (const [re, word] of HINDI_SYMBOL_WORDS) text = text.replace(re, word);
  }
  text = normalizeForSpeech(text);
  return text.replace(/\s{2,}/g, " ").trim();
}

/** Speech-safe chunks that keep Devanagari danda and sentence boundaries. */
export function speechChunks(text: string, maxLen = 220): string[] {
  const parts = text
    .split(/(?<=[.!?।])\s+/)
    .flatMap((s) =>
      s.length <= maxLen ? [s] : (s.match(new RegExp(`.{1,${maxLen}}(?:\\s|$)`, "g")) ?? [s]),
    )
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

/* ------------------------------------------------------------------ */
/* browser voice selection (real availability only)                    */
/* ------------------------------------------------------------------ */

/** Minimal shape of a browser voice, so this stays testable without a DOM. */
export type VoiceLike = { name: string; lang: string; localService?: boolean };

export type VoicePick<V extends VoiceLike> = {
  /** null when the device exposes no voice at all. */
  voice: V | null;
  /** true when the chosen voice really matches the classroom language. */
  matchesLanguage: boolean;
  /** honest reason, for internal logging. */
  reason: string;
};

/**
 * Pick the best voice the browser ACTUALLY exposes for the selected classroom
 * language. Nothing is assumed to exist: when no Hindi-capable voice is
 * installed, `matchesLanguage` is false and the caller may fail over instead of
 * reading Hindi with an English-only voice.
 */
export function pickVoiceForLanguage<V extends VoiceLike>(
  voices: readonly V[],
  language: ClassroomLanguage,
): VoicePick<V> {
  const list = [...voices];
  if (!list.length) return { voice: null, matchesLanguage: false, reason: "no voices exposed" };
  const norm = (v: V) => v.lang.replace("_", "-").toLowerCase();
  const isHindi = (v: V) => norm(v).startsWith("hi");
  const isIndianEnglish = (v: V) => norm(v) === "en-in";
  const isEnglish = (v: V) => norm(v).startsWith("en");

  const quality = (v: V) =>
    (/(google|microsoft|neural|natural|online|premium|enhanced)/i.test(v.name) ? 2 : 0) +
    (v.localService ? 1 : 0);

  const score = (v: V): number => {
    let s = quality(v);
    if (language === "hindi") {
      if (isHindi(v)) s += 40;
      else if (isIndianEnglish(v)) s += 8; // best compatible if no Hindi exists
      else if (isEnglish(v)) s += 2;
    } else if (language === "english") {
      if (isIndianEnglish(v)) s += 30;
      else if (isEnglish(v)) s += 26;
      else if (isHindi(v)) s += 1;
    } else {
      // Hinglish: an Indian-English voice reads mixed Hindi+English best,
      // with a Hindi voice as the next natural choice.
      if (isIndianEnglish(v)) s += 34;
      else if (isHindi(v)) s += 20;
      else if (isEnglish(v)) s += 14;
    }
    return s;
  };

  const best = list.sort((a, b) => score(b) - score(a))[0]!;
  const matches =
    language === "hindi"
      ? isHindi(best)
      : language === "english"
        ? isEnglish(best)
        : isEnglish(best) || isHindi(best);
  const reason = matches
    ? `using ${best.name} (${best.lang})`
    : `no ${language} voice installed — best available is ${best.name} (${best.lang})`;
  return { voice: best, matchesLanguage: matches, reason };
}

/* ------------------------------------------------------------------ */
/* provider-side voice configuration                                   */
/* ------------------------------------------------------------------ */

/**
 * Delivery steering for the Lovable TTS model, per classroom language.
 * Hindi asks explicitly for Devanagari-accurate Hindi so the model never reads
 * a Hindi sentence with English pronunciation.
 */
export const SPEECH_INSTRUCTIONS: Record<ClassroomLanguage, string> = {
  english:
    "Speak in clear, natural Indian English like a friendly school teacher. Warm, steady pace. Do not read punctuation or formatting aloud.",
  hindi:
    "पूरी बात शुद्ध और स्वाभाविक हिंदी में बोलें, जैसे एक अच्छे स्कूल शिक्षक पढ़ाते हैं। शब्दों का उच्चारण हिंदी की तरह करें, अंग्रेज़ी उच्चारण में न बोलें। वैज्ञानिक अंग्रेज़ी शब्द वैसे ही बोलें, बाकी वाक्य हिंदी में रहे। विराम चिह्न न पढ़ें।",
  hinglish:
    "Speak natural spoken Hinglish the way an Indian teacher explains in class: Hindi sentence flow with English technical words kept in English. One single natural voice, not two languages read separately. Do not read punctuation aloud.",
};

/** Voice name sent to the Lovable TTS model per classroom language. */
export const SPEECH_VOICE: Record<ClassroomLanguage, string> = {
  english: "alloy",
  hindi: "alloy",
  hinglish: "alloy",
};
