import { de } from "./de";
import { en, type MessageKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { hi } from "./hi";
import { ja } from "./ja";
import { zh } from "./zh";

export type { MessageKey } from "./en";

/** The languages the app is translated into, named in their own language. */
export const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "es", name: "Español" },
  { id: "fr", name: "Français" },
  { id: "de", name: "Deutsch" },
  { id: "zh", name: "简体中文" },
  { id: "ja", name: "日本語" },
  { id: "hi", name: "हिन्दी" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];

/** Every translation; a key missing from one falls back to English. */
export const CATALOGS: Record<Language, Record<string, string>> = { en, es, fr, de, zh, ja, hi };

const STORAGE_KEY = "paperlines.language";

/** The saved choice: a language, or "system" to follow the computer's language. */
export function languageSetting(): Language | "system" {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && v in CATALOGS) return v as Language;
  } catch {
    // no storage (private window, tests): follow the system
  }
  return "system";
}

/** Saves the choice and reloads, so every screen is drawn again in the new language. */
export function setLanguage(lang: Language | "system") {
  try {
    if (lang === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // nothing saved: the change lasts until the app restarts
  }
  window.location.reload();
}

/** The first of the system's preferred languages that the app speaks ("zh-CN" → "zh"), else English. */
export function systemLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base in CATALOGS) return base as Language;
  }
  return "en";
}

function resolve(): Language {
  const chosen = languageSetting();
  if (chosen !== "system") return chosen;
  return typeof navigator === "undefined"
    ? "en"
    : systemLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** The language the app is shown in, decided once when it starts. */
export const language: Language = resolve();
const catalog: Record<string, string> = { ...en, ...CATALOGS[language] };
const plural = new Intl.PluralRules(language);
if (typeof document !== "undefined") document.documentElement.lang = language;

/** Number formatting in the app's language (1,234 / 1.234 / 1 234). */
export const numberFormat = new Intl.NumberFormat(language);

/** Looks up `key`; when `vars.n` is given, prefers `key.<plural category>` (e.g. "library.count.one"). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const n = vars?.n;
  const form = typeof n === "number" ? catalog[`${key}.${plural.select(n)}`] : undefined;
  let s = form ?? catalog[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
