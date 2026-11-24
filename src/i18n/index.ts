import { en, type MessageKey } from "./en";

const catalog: Record<string, string> = en;
const plural = new Intl.PluralRules("en");

/** Looks up `key`; when `vars.n` is given, prefers `key.<plural category>` (e.g. "library.count.one"). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const n = vars?.n;
  const form = typeof n === "number" ? catalog[`${key}.${plural.select(n)}`] : undefined;
  let s = form ?? catalog[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
