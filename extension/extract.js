// What paper a page is about. Runs inside the page (injected by the popup with
// chrome.scripting.executeScript, so it must not use anything outside its own body) and, for pages
// the extension can't enter (the browser's PDF viewer), on an empty document with just the URL.
// Journals, arXiv and PubMed publish `citation_*` meta tags (the Google Scholar convention).

export function extract(doc = document, href = location.href) {
  const one = (names) => {
    for (const n of names) {
      const el = doc.querySelector(`meta[name="${n}" i], meta[property="${n}" i]`);
      const v = el?.getAttribute("content")?.trim();
      if (v) return v;
    }
    return null;
  };
  const all = (names) => {
    for (const n of names) {
      const v = [...doc.querySelectorAll(`meta[name="${n}" i]`)]
        .map((m) => m.getAttribute("content")?.trim())
        .filter(Boolean);
      if (v.length) return v;
    }
    return [];
  };
  const doiIn = (s) =>
    s?.match(/\b10\.\d{4,9}\/[^\s"<>?#]+/i)?.[0].replace(/[.,;)\]]+$/, "") ?? null;
  const arxivIn = (s) =>
    s?.match(
      /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i,
    )?.[1] ?? null;
  const pmidIn = (s) => s?.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i)?.[1] ?? null;
  const absolute = (u) => {
    try {
      return u ? new URL(u, href).href : null;
    } catch {
      return null;
    }
  };

  const isPdf = doc.contentType === "application/pdf" || /\.pdf($|[?#])/i.test(href);
  const doi =
    doiIn(one(["citation_doi", "prism.doi", "bepress_citation_doi", "dc.identifier.doi"])) ??
    doiIn(all(["dc.identifier"]).find((v) => /10\.\d{4,9}\//.test(v))) ??
    doiIn(/doi\.org\/|\/doi\//i.test(href) ? decodeURIComponent(href) : null);
  const arxivId = one(["citation_arxiv_id"]) ?? arxivIn(href);
  const pmid = one(["citation_pmid"]) ?? pmidIn(href);
  const title =
    one(["citation_title", "dc.title", "og:title"]) ?? (isPdf ? null : doc.title?.trim() || null);
  const authors = all(["citation_author", "dc.creator", "author"]);
  const date = one([
    "citation_publication_date",
    "citation_date",
    "citation_online_date",
    "citation_year",
    "dc.date",
    "prism.publicationdate",
  ]);
  const year = Number(date?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]) || null;
  const venue = one([
    "citation_journal_title",
    "citation_conference_title",
    "prism.publicationname",
    "citation_publisher",
  ]);
  // the PDF: the page itself, the publisher's link, or arXiv's
  const pdfUrl = isPdf
    ? href
    : (absolute(one(["citation_pdf_url"])) ??
      (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null));

  return { doi, arxivId, pmid, title, authors, year, venue, url: href, pdfUrl, isPdf };
}
