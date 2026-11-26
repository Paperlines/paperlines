// The popup: find the paper on the current tab, say whether it's already in the library, and save
// it (with its PDF) through Paperlines' native messaging host. Page text is only ever set as
// textContent, never as HTML.
import { extract } from "./extract.js";

const HOST = "dev.example.paperlines";
const msg = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;
const main = document.getElementById("main");

for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = msg(el.dataset.i18n);

/** One request to Paperlines; rejects with a NotConnected error when the host isn't registered. */
async function ask(message) {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST, message);
    if (reply?.type === "error") throw new Error(reply.message);
    return reply;
  } catch (e) {
    const text = String(e?.message ?? e);
    if (/native messaging host|not found|forbidden|exited/i.test(text)) {
      const err = new Error(text);
      err.notConnected = true;
      throw err;
    }
    throw e;
  }
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function show(...nodes) {
  main.replaceChildren(...nodes.filter(Boolean));
}

function notConnected() {
  show(
    el("p", { className: "status error", textContent: msg("notConnected") }),
    el(
      "ol",
      {},
      el("li", { textContent: msg("setupOpen") }),
      el("li", { textContent: msg("setupConnect") }),
      el("li", { textContent: msg("setupReload") }),
    ),
  );
}

function paperCard(p) {
  const who = p.authors.length > 2 ? `${p.authors[0]} et al.` : p.authors.join(", ");
  const meta = [who, p.year, p.venue].filter(Boolean).join(" · ");
  const ids = [
    p.doi && `DOI ${p.doi}`,
    p.arxivId && `arXiv ${p.arxivId}`,
    p.pmid && `PMID ${p.pmid}`,
  ]
    .filter(Boolean)
    .join("  ");
  return el(
    "div",
    { className: "paper" },
    el("div", { className: "title", textContent: p.title || msg("untitled") }),
    meta ? el("div", { className: "meta", textContent: meta }) : null,
    ids ? el("div", { className: "ids", textContent: ids }) : null,
  );
}

/** The page's PDF as base64, or null if it can't be had (no permission, a login page, …). */
async function fetchPdf(url) {
  const origin = `${new URL(url).origin}/*`;
  // the active tab's own site is allowed by the click; another site (a CDN) needs the user's yes
  const allowed =
    (await chrome.permissions.contains({ origins: [origin] })) ||
    (await chrome.permissions.request({ origins: [origin] }).catch(() => false));
  if (!allowed) return null;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // %PDF-: anything else is a login or download page
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46))
    return null;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function readTab(tab) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extract,
    });
    if (res?.result) return res.result;
  } catch {
    // the browser's PDF viewer and its own pages can't be entered: go by the address
  }
  return extract(new DOMParser().parseFromString("<html></html>", "text/html"), tab.url ?? "");
}

function render(paper, found) {
  const hasIds = paper.doi || paper.arxivId || paper.pmid;
  const nodes = [paperCard(paper)];
  const status = el("p", { className: "status" });
  const item = found?.item;
  if (item) {
    status.className = "status ok";
    status.textContent = msg("alreadyIn", item.citekey);
  } else if (!hasIds && !paper.isPdf) {
    status.className = "status muted";
    status.textContent = msg("noIds");
  }
  nodes.push(status);

  const canPdf = Boolean(paper.pdfUrl) && !(item && item.hasPdf);
  const pdfBox = el("input", { type: "checkbox", checked: canPdf, disabled: !canPdf });
  if (canPdf) nodes.push(el("label", { className: "check" }, pdfBox, msg("includePdf")));
  if (item && item.hasPdf) return show(...nodes);

  const button = el("button", {
    type: "button",
    textContent: item ? msg("addPdf") : msg("save"),
  });
  if (item && !canPdf) return show(...nodes);
  nodes.push(button);
  show(...nodes);
  button.focus();

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.className = "status muted";
    let pdf = null;
    if (canPdf && pdfBox.checked) {
      status.textContent = msg("fetchingPdf");
      pdf = await fetchPdf(paper.pdfUrl).catch(() => null);
    }
    status.textContent = msg("saving");
    try {
      const r = await ask({ type: "save", page: paper, pdf });
      status.className = "status ok";
      status.textContent = r.added
        ? r.pdfAttached
          ? msg("savedWithPdf", r.item.citekey)
          : msg("saved", r.item.citekey)
        : r.pdfAttached
          ? msg("pdfAdded", r.item.citekey)
          : msg("alreadyIn", r.item.citekey);
      if (canPdf && pdfBox.checked && !pdf) {
        main.append(el("p", { className: "muted", textContent: msg("pdfUnavailable") }));
      }
      button.remove();
      pdfBox.closest("label")?.remove();
    } catch (e) {
      if (e.notConnected) return notConnected();
      status.className = "status error";
      status.textContent = String(e.message ?? e);
      button.disabled = false;
    }
  });
}

async function start() {
  // ?tab=<id>: which tab to read, for automated tests (a real popup reads the active tab)
  const pinned = Number(new URLSearchParams(location.search).get("tab"));
  const [tab] = pinned
    ? [await chrome.tabs.get(pinned)]
    : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const paper = await readTab(tab);
  let found = null;
  try {
    await ask({ type: "ping" });
    found = await ask({ type: "lookup", page: paper });
  } catch (e) {
    if (e.notConnected) return notConnected();
    show(
      paperCard(paper),
      el("p", { className: "status error", textContent: String(e.message ?? e) }),
    );
    return;
  }
  render(paper, found);
}

start();
