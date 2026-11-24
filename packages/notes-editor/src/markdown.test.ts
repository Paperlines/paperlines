// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { linkFromClick, quoteBullet, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders wikilinks with resolution state and labels", () => {
    const html = renderMarkdown("See [[vaswani2017attention]] and [[Missing|a label]].", {
      resolve: (t) =>
        t === "vaswani2017attention"
          ? { exists: true, title: "Attention Is All You Need" }
          : { exists: false },
    });
    expect(html).toContain(
      'class="wikilink" data-wikilink="vaswani2017attention">Attention Is All You Need</a>',
    );
    expect(html).toContain('class="wikilink unresolved" data-wikilink="Missing">a label</a>');
  });

  it("renders @citekeys but not emails", () => {
    const html = renderMarkdown("cf. @he2016deep, mail a@b.com");
    expect(html).toContain('data-cite="he2016deep"');
    expect(html).not.toContain('data-cite="b.com"');
  });

  it("renders inline and block math with KaTeX", () => {
    const html = renderMarkdown("Energy $E=mc^2$ costs $5 and $6.\n\n$$\n\\int_0^1 x\\,dx\n$$");
    expect(html).toContain('class="katex"');
    expect(html).toContain("math-block");
    expect(html).toContain("costs $5 and $6");
  });

  it("never renders raw HTML or javascript: links", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> [x](javascript:alert(1))');
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
  });
});

describe("links", () => {
  it("classifies clicks", () => {
    const host = document.createElement("div");
    host.innerHTML = renderMarkdown("[[a]] @b [p. 3](#hl-12) [w](https://example.org) [r](rel)");
    const as = host.querySelectorAll("a");
    expect([...as].map((a) => linkFromClick(a))).toEqual([
      { kind: "wikilink", target: "a" },
      { kind: "cite", target: "b" },
      { kind: "highlight", id: 12 },
      { kind: "external", url: "https://example.org" },
      null,
    ]);
  });

  it("builds quote bullets that link back to the highlight", () => {
    expect(quoteBullet("  multi\n line ", 3, 7)).toBe("> multi line ([p. 3](#hl-7))");
  });
});

it("makes plain one-line snippets", async () => {
  const { plainSnippet } = await import("./markdown");
  expect(
    plainSnippet("- builds on [[vaswani2017attention]] and [[x|label]], see [p. 3](#hl-1) **now**"),
  ).toBe("builds on vaswani2017attention and label, see p. 3 now");
  expect(plainSnippet("> quoted")).toBe("quoted");
});

it("renders pipe tables", () => {
  const html = renderMarkdown("| Paper | dz |\n| --- | --- |\n| [[a]] | 1 µm |");
  expect(html).toContain('<div class="md-table"><table>');
  expect(html).toContain("<th>Paper</th>");
  expect(html).toContain('data-wikilink="a"');
});
