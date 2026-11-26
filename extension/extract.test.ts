// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extract } from "./extract.js";

const page = (head: string, title = "") =>
  new DOMParser().parseFromString(
    `<html><head><title>${title}</title>${head}</head></html>`,
    "text/html",
  );

describe("finding the paper on a page", () => {
  it("reads a journal's citation meta tags", () => {
    const doc = page(`
      <meta name="citation_title" content="Deep Residual Learning for Image Recognition">
      <meta name="citation_author" content="He, Kaiming">
      <meta name="citation_author" content="Zhang, Xiangyu">
      <meta name="citation_publication_date" content="2016/06/27">
      <meta name="citation_conference_title" content="CVPR">
      <meta name="citation_doi" content="10.1109/CVPR.2016.90">
      <meta name="citation_pdf_url" content="/content/pdf/resnet.pdf">`);
    expect(extract(doc, "https://publisher.example/article/123")).toEqual({
      doi: "10.1109/CVPR.2016.90",
      arxivId: null,
      pmid: null,
      title: "Deep Residual Learning for Image Recognition",
      authors: ["He, Kaiming", "Zhang, Xiangyu"],
      year: 2016,
      venue: "CVPR",
      url: "https://publisher.example/article/123",
      pdfUrl: "https://publisher.example/content/pdf/resnet.pdf",
      isPdf: false,
    });
  });

  it("knows arXiv pages and PDFs from the address", () => {
    const abs = extract(page("", "Attention Is All You Need"), "https://arxiv.org/abs/1706.03762");
    expect(abs.arxivId).toBe("1706.03762");
    expect(abs.title).toBe("Attention Is All You Need");
    expect(abs.pdfUrl).toBe("https://arxiv.org/pdf/1706.03762");
    // the browser's PDF viewer: only the URL is known
    const pdf = extract(page(""), "https://arxiv.org/pdf/1706.03762v7");
    expect(pdf).toMatchObject({ arxivId: "1706.03762", isPdf: false, title: null });
    const file = extract(page(""), "https://example.org/papers/attention.pdf");
    expect(file).toMatchObject({
      isPdf: true,
      pdfUrl: "https://example.org/papers/attention.pdf",
      title: null,
    });
  });

  it("finds DOIs in Dublin Core tags and doi.org links, and PubMed IDs", () => {
    const dc = extract(
      page(`<meta name="dc.identifier" content="doi:10.1038/nature14539.">`),
      "https://x.org/a",
    );
    expect(dc.doi).toBe("10.1038/nature14539");
    expect(extract(page(""), "https://doi.org/10.1145/3290605.3300233").doi).toBe(
      "10.1145/3290605.3300233",
    );
    expect(extract(page(""), "https://pubmed.ncbi.nlm.nih.gov/31452104/").pmid).toBe("31452104");
  });

  it("falls back to the page title, and finds nothing on an ordinary page", () => {
    const blog = extract(page("", "My blog post"), "https://blog.example/post");
    expect(blog).toMatchObject({
      doi: null,
      arxivId: null,
      pmid: null,
      title: "My blog post",
      pdfUrl: null,
    });
  });
});
