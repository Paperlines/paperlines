import { describe, expect, it } from "vitest";
import { en } from "./en";
import { CATALOGS, LANGUAGES, systemLanguage, t } from "./index";

it("interpolates and picks plural forms", () => {
  expect(t("library.count", { n: 1 })).toBe("1 item");
  expect(t("library.count", { n: 3 })).toBe("3 items");
  expect(t("import.done", { added: 1, merged: 0, skipped: 2 })).toBe(
    "Added 1, merged 0, skipped 2",
  );
});

it("follows the system's language when the app speaks it", () => {
  expect(systemLanguage(["de-CH", "en-US"])).toBe("de");
  expect(systemLanguage(["zh-CN"])).toBe("zh");
  expect(systemLanguage(["pt-BR", "ja"])).toBe("ja");
  expect(systemLanguage(["he-IL"])).toBe("en");
});

const PLURAL = /\.(zero|one|two|few|many|other)$/;
const english = en as Record<string, string>;
/** The English keys every translation needs: all but the plural variants ("…​.one"). */
const baseKeys = Object.keys(english).filter(
  (k) => !(PLURAL.test(k) && k.replace(PLURAL, "") in english),
);
const placeholders = (s: string) => new Set(s.match(/\{[a-zA-Z]+\}/g) ?? []);

describe.each(LANGUAGES.filter((l) => l.id !== "en"))("$name ($id)", ({ id }) => {
  const cat = CATALOGS[id];
  const categories = new Intl.PluralRules(id).resolvedOptions().pluralCategories;

  it("translates every message", () => {
    const missing = baseKeys.filter((k) => !cat[k]?.trim());
    expect(missing).toEqual([]);
  });

  it("has no keys English doesn't have", () => {
    const unknown = Object.keys(cat).filter((k) => {
      if (k in english && !PLURAL.test(k)) return false;
      const base = k.replace(PLURAL, "");
      const category = k.match(PLURAL)?.[1] as Intl.LDMLPluralRule | undefined;
      // a plural form of a real key, in a category this language uses
      return !(base in english && category && categories.includes(category));
    });
    expect(unknown).toEqual([]);
  });

  it("gives a 'one' form wherever English has one and the language uses it", () => {
    if (!categories.includes("one")) return;
    const missing = Object.keys(english)
      .filter((k) => k.endsWith(".one"))
      .filter((k) => !cat[k]?.trim());
    expect(missing).toEqual([]);
  });

  it("keeps the {placeholders}", () => {
    const wrong: string[] = [];
    for (const [k, v] of Object.entries(cat)) {
      const base = k.replace(PLURAL, "");
      const expected = placeholders(english[k] ?? english[base] ?? "");
      const got = placeholders(v ?? "");
      if (k in english && !PLURAL.test(k)) {
        // a full message: exactly the English placeholders
        if ([...expected].sort().join() !== [...got].sort().join()) wrong.push(k);
      } else {
        // a plural form may spell the number out or use {n}, but adds nothing else
        const allowed = new Set([...placeholders(english[base] ?? ""), "{n}"]);
        if ([...got].some((p) => !allowed.has(p))) wrong.push(k);
      }
    }
    expect(wrong).toEqual([]);
  });
});
