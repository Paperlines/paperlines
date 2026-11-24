import { expect, it } from "vitest";
import { formatShortcut, isTyping, matchesShortcut, platformFor } from "./platform";

const mac = platformFor("macos");
const linux = platformFor("linux");
const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  }) as KeyboardEvent;

it("shows the right symbol per OS", () => {
  expect(formatShortcut(mac, "mod+k")).toBe("⌘K");
  expect(formatShortcut(linux, "mod+k")).toBe("Ctrl+K");
});

it("matches shortcuts with the platform modifier", () => {
  expect(matchesShortcut(mac, "mod+k", ev("k", { metaKey: true }))).toBe(true);
  expect(matchesShortcut(mac, "mod+k", ev("k", { ctrlKey: true }))).toBe(false);
  expect(matchesShortcut(linux, "mod+k", ev("k", { ctrlKey: true }))).toBe(true);
  expect(matchesShortcut(linux, "t", ev("t"))).toBe(true);
  expect(matchesShortcut(linux, "t", ev("t", { ctrlKey: true }))).toBe(false);
  expect(matchesShortcut(mac, "mod+backspace", ev("Backspace", { metaKey: true }))).toBe(true);
  expect(matchesShortcut(mac, "mod+shift+p", ev("P", { metaKey: true, shiftKey: true }))).toBe(
    true,
  );
  expect(matchesShortcut(mac, "mod+p", ev("p", { metaKey: true, shiftKey: true }))).toBe(true);
});

it("detects typing targets", () => {
  expect(isTyping({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
  expect(isTyping({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(
    false,
  );
  expect(isTyping(null)).toBe(false);
});
