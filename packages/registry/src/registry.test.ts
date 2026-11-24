import { expect, it } from "vitest";
import { fuzzyScore, Registry } from "./index";

it("registers, hides by `when`, and unregisters", () => {
  const r = new Registry();
  let visible = false;
  const off = r.registerCommand({ id: "a", title: "A", run: () => {} });
  r.registerCommand({ id: "b", title: "B", when: () => visible, run: () => {} });
  expect(r.listCommands().map((c) => c.id)).toEqual(["a"]);
  visible = true;
  expect(r.listCommands()).toHaveLength(2);
  off();
  expect(r.listCommands().map((c) => c.id)).toEqual(["b"]);
});

it("scores fuzzy matches", () => {
  expect(fuzzyScore("xyz", "Open settings")).toBeNull();
  const a = fuzzyScore("set", "Settings") ?? 0;
  const b = fuzzyScore("set", "Mark as unread to test") ?? 0;
  expect(a).toBeGreaterThan(b);
  expect(fuzzyScore("ns", "New saved search")).not.toBeNull();
});
