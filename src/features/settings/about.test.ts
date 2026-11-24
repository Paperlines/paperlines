import { describe, expect, it } from "vitest";
import { apaName } from "./AboutSettings";

describe("APA names", () => {
  it("family name, then initials", () => {
    expect(apaName("Yoav Yosif-Or")).toBe("Yosif-Or, Y.");
    expect(apaName("Ada Byron Lovelace")).toBe("Lovelace, A. B.");
    expect(apaName("Plato")).toBe("Plato");
  });
});
