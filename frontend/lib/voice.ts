/**
 * Voice in and out using the browser's Web Speech API (README 10.3). On Google Cloud this is
 * replaced by Speech-to-Text / Text-to-Speech behind the same two functions. Support for
 * Sinhala and Tamil depends on the browser and OS voices installed; callers must handle `false`.
 */

export type Lang = "en" | "si" | "ta";

export const LANGS: { code: Lang; label: string; bcp47: string }[] = [
  { code: "en", label: "English", bcp47: "en-US" },
  { code: "si", label: "සිංහල", bcp47: "si-LK" },
  { code: "ta", label: "தமிழ்", bcp47: "ta-LK" },
];

const bcp47 = (lang: Lang) => LANGS.find((l) => l.code === lang)!.bcp47;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function voiceInputSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Listen once; resolves with the transcript or rejects with the browser's error. */
export function listen(lang: Lang): Promise<string> {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return new Promise((resolve, reject) => {
    if (!Ctor) return reject(new Error("Voice input is not supported in this browser"));
    const rec = new Ctor();
    rec.lang = bcp47(lang);
    rec.interimResults = false;
    rec.onresult = (e: any) => resolve(e.results[0][0].transcript as string);
    rec.onerror = (e: any) => reject(new Error(e.error || "Voice input failed"));
    rec.start();
  });
}

/** Speak text; returns false when the browser has no voice for the language. */
export function speak(text: string, lang: Lang): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const tag = bcp47(lang);
  const has = window.speechSynthesis.getVoices().some((v) => v.lang.startsWith(tag.slice(0, 2)));
  if (!has) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag;
  window.speechSynthesis.speak(u);
  return true;
}
