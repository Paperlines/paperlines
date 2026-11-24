import { expect, it } from "vitest";
import { t } from "./index";

it("interpolates and picks plural forms", () => {
  expect(t("library.count", { n: 1 })).toBe("1 item");
  expect(t("library.count", { n: 3 })).toBe("3 items");
  expect(t("import.done", { added: 1, merged: 0, skipped: 2 })).toBe(
    "Added 1, merged 0, skipped 2",
  );
});
