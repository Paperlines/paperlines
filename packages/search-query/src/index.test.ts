import { describe, expect, it } from "vitest";
import fixtures from "../../../crates/search/fixtures/queries.json";
import { inRange, parse, parseRange, qualifier, tokenAtEnd } from "./index";

describe("parse matches the Rust parser (shared fixtures)", () => {
  for (const f of fixtures) {
    it(f.q, () => expect(parse(f.q)).toEqual(f.terms));
  }
});

it("quotes qualifiers", () => {
  expect(qualifier("project", "My thesis")).toBe('project:"My thesis"');
  expect(qualifier("tag", "ml/nlp")).toBe("tag:ml/nlp");
});

it("finds the token being typed", () => {
  expect(tokenAtEnd("deep tag:ml/")).toEqual({ key: "tag", partial: "ml/", start: 5 });
  expect(tokenAtEnd('x -project:"My th')).toEqual({ key: "project", partial: "My th", start: 3 });
  expect(tokenAtEnd("deep lea")).toEqual({ key: null, partial: "lea", start: 5 });
});

it("parses and applies ranges", () => {
  expect(inRange(parseRange(">=2020") ?? { op: "=", n: 0 }, 2021)).toBe(true);
  expect(inRange(parseRange("2018..2016") ?? { op: "=", n: 0 }, 2017)).toBe(true);
  expect(parseRange("soon")).toBeNull();
});
