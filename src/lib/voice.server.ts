/** Voice engine: external TTS/STT providers (browser TTS is handled client-side). */
import { requireGuest } from "./guest.server";
import { usableProviders } from "./api-manager.server";
import { ttsSynthesize, sttTranscribe } from "./provider-clients.server";
import {
  SPEECH_INSTRUCTIONS,
  SPEECH_VOICE,
  cleanForSpeech,
  toClassroomLanguage,
} from "./classroom-speech";

/**
 * API Manager TTS priority: ElevenLabs first, then Deepgram, then OpenAI. Each
 * configured provider is TRIED in order; only when every configured provider
 * fails do we throw.
 */
export const VOICE_TTS_ORDER = ["elevenlabs", "deepgram", "openai"] as const;

/**
 * Classroom TTS stages (spec §5/§19). The classroom asks for ONE stage at a
 * time so the client can run the exact failover order
 * Lovable TTS → Browser TTS → API Manager TTS.
 *  - "lovable":     built-in Lovable AI voice only (first priority).
 *  - "api_manager": the user's OWN configured providers only (last resort).
 *  - "auto":        legacy behaviour (configured providers, then Lovable).
 */
export type TtsStage = "lovable" | "api_manager" | "auto";

/** Thrown message the client recognises as "nothing is configured here". */
const NO_API_MANAGER_TTS = "No voice provider is configured in API Manager.";

/** TTS via the built-in Lovable AI gateway (no user API key needed). */
async function gatewaySynthesize(
  text: string,
  language: "english" | "hindi" | "hinglish",
): Promise<{ audioBase64: string; mime: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Lovable voice is not configured (no API key).");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: SPEECH_VOICE[language],
      // Language authority: delivery is steered by the CLASSROOM language, so a
      // Hindi lesson is spoken as Hindi and never with English pronunciation.
      instructions: SPEECH_INSTRUCTIONS[language],
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Lovable voice failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  // HTTP 200 is NOT success (§6): empty or absurdly short audio is a failure.
  if (bytes.byteLength < 1024) {
    throw new Error(`Lovable voice returned unusable audio (${bytes.byteLength} bytes).`);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { audioBase64: btoa(binary), mime: "audio/mpeg" };
}

export async function synthesize(input: {
  token: unknown;
  text: string;
  provider?: string | undefined;
  /** classroom teaching language ("english" | "hindi" | "hinglish") */
  language?: string | undefined;
  /** which failover stage to run (default: legacy "auto") */
  stage?: string | undefined;
}) {
  const guestId = await requireGuest(input.token);
  const language = toClassroomLanguage(input.language);
  const stage: TtsStage =
    input.stage === "lovable" || input.stage === "api_manager" ? input.stage : "auto";
  // Speech-only text, cleaned in the SELECTED classroom language (§8/§11).
  const text = cleanForSpeech(input.text, language).slice(0, 4000);
  if (!text) throw new Error("Nothing to speak after cleaning the text.");

  if (stage === "lovable") {
    const audio = await gatewaySynthesize(text, language);
    return { ...audio, provider: "lovable", language };
  }

  const available = await usableProviders(guestId);
  const requested = input.provider ? [input.provider] : [...VOICE_TTS_ORDER];
  const order = [...new Set([...requested, ...VOICE_TTS_ORDER])].filter((p) => p !== "browser");
  const usable = order.map((p) => available.find((a) => a.provider === p)).filter(Boolean);

  if (!usable.length) {
    // The user's own API Manager has no TTS provider. Never fake audio (§6/TEST 6).
    if (stage === "api_manager") throw new Error(NO_API_MANAGER_TTS);
    const audio = await gatewaySynthesize(text, language);
    return { ...audio, provider: "lovable", language };
  }

  const errors: string[] = [];
  // Try each configured provider in priority order; the first success wins.
  for (const chosen of usable) {
    try {
      const audio = await ttsSynthesize(chosen!.provider, chosen!.config, text);
      if (!audio.audioBase64 || audio.audioBase64.length < 512) {
        throw new Error("returned empty audio");
      }
      return { ...audio, provider: chosen!.provider, language };
    } catch (e) {
      errors.push(`${chosen!.provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (stage === "api_manager") {
    throw new Error(`All API Manager voice providers failed (${errors.join("; ")}).`);
  }
  try {
    const audio = await gatewaySynthesize(text, language);
    return { ...audio, provider: "lovable", language };
  } catch {
    throw new Error(
      `All voice providers failed (${errors.join("; ")}). Browser voice is still available.`,
    );
  }
}


/** Fallback STT via the built-in Lovable AI gateway (no user API key needed). */
async function gatewayTranscribe(base64: string, mime: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey)
    throw new Error("No speech-to-text provider is connected. Use browser dictation instead.");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const base = (mime || "audio/webm").split(";")[0] ?? "audio/webm";
  const ext =
    (
      {
        "audio/webm": "webm",
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
      } as Record<string, string>
    )[base] ?? "webm";
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: base }), `recording.${ext}`);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transcription failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export async function transcribe(input: {
  token: unknown;
  base64: string;
  mime: string;
  provider?: string | undefined;
}) {
  const guestId = await requireGuest(input.token);
  const available = await usableProviders(guestId);
  const order = input.provider ? [input.provider] : ["deepgram", "groq", "openai", "assemblyai"];
  const chosen = order.map((p) => available.find((a) => a.provider === p)).find(Boolean);
  if (!chosen) {
    const text = await gatewayTranscribe(input.base64, input.mime);
    return { text, provider: "lovable" };
  }
  const text = await sttTranscribe(chosen.provider, chosen.config, {
    base64: input.base64,
    mime: input.mime,
  });
  return { text, provider: chosen.provider };
}

export async function availableVoiceProviders(token: unknown) {
  const guestId = await requireGuest(token);
  const available = await usableProviders(guestId);
  return {
    tts: [
      ...available
        .filter((p) => ["elevenlabs", "deepgram", "openai"].includes(p.provider))
        .map((p) => p.provider),
      ...(process.env["LOVABLE_API_KEY"] ? ["lovable"] : []),
    ],
    stt: [
      ...available
        .filter((p) => ["deepgram", "groq", "openai", "assemblyai"].includes(p.provider))
        .map((p) => p.provider),
      ...(process.env["LOVABLE_API_KEY"] ? ["lovable"] : []),
    ],
  };
}
