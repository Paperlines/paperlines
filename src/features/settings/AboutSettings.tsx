import type { PlatformInfo } from "@paperlines/backend-port";
import { renderMarkdown } from "@paperlines/notes-editor";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Compass,
  Copy,
  ExternalLink,
  Globe,
  Keyboard,
  type LucideIcon,
  Quote,
  RefreshCw,
  Scale,
  ScrollText,
  Star,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import changelog from "../../../CHANGELOG.md?raw";
import logo2x from "../../assets/logo-128.png";
import { backend } from "../../backend";
import { branding } from "../../branding.generated";
import { t } from "../../i18n";
import { useDialogs } from "../../store/dialogs";
import { useTour } from "../../store/tour";

const BUILD =
  typeof __BUILD__ !== "undefined" ? __BUILD__ : { version: "dev", commit: null, date: "" };
/** Project links from branding.json (empty until published: their rows stay hidden). */
const PROJECT: { repository: string; website: string; license: string; author: string } = {
  repository: branding.repository,
  website: branding.website,
  license: branding.license,
  author: branding.author,
};
const REPO = PROJECT.repository.replace(/\/$/, "");

const open = (url: string) => backend.openExternal(url);

/** A copy button that confirms for a moment. */
function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text) =>
      navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }),
  ];
}

/** One row in a list: icon, title (and detail), and an arrow for in-app or a box for a link out. */
function Row({
  icon: Icon,
  title,
  detail,
  external,
  extra,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  external?: boolean;
  extra?: ReactNode;
  onClick(): void;
}) {
  return (
    <li>
      <button type="button" className="about-row" onClick={onClick}>
        <Icon size={17} aria-hidden="true" className="about-row-icon" />
        <span className="about-row-text">
          <span className="about-row-title">{title}</span>
          {detail && <span className="about-row-detail">{detail}</span>}
        </span>
        {extra}
        {external ? (
          <ExternalLink size={15} aria-hidden="true" className="about-row-end" />
        ) : (
          <ChevronRight size={16} aria-hidden="true" className="about-row-end" />
        )}
      </button>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="about-group" aria-label={title}>
      <h3 className="field-label">{title}</h3>
      <ul className="about-rows">{children}</ul>
    </section>
  );
}

/** "Yoav Yosif-Or" → "Yosif-Or, Y." (APA: family name, initials). */
export function apaName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim();
  const family = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(" ");
  return `${family}, ${initials}`;
}

/** How to cite the app: BibTeX (shown, coloured) and APA. */
function citation() {
  const year = (BUILD.date || new Date().toISOString()).slice(0, 4);
  // the contributors come first, then the person who started the project
  const who = PROJECT.author
    ? `{The ${branding.displayName} contributors} and ${PROJECT.author}`
    : `{The ${branding.displayName} contributors}`;
  const title = `${branding.displayName}: a local-first reference manager`;
  // braces keep the name's capital when a style lowercases titles
  const bibTitle = `{${branding.displayName}}: a local-first reference manager`;
  const fields: [string, string][] = [
    ["author", who],
    ["title", bibTitle],
    ["year", year],
    ["version", BUILD.version],
    ...(REPO ? ([["url", REPO]] as [string, string][]) : []),
    ...(PROJECT.license ? ([["license", PROJECT.license]] as [string, string][]) : []),
  ];
  const key = branding.cliCommand;
  const width = Math.max(...fields.map(([k]) => k.length));
  const bibtex = `@software{${key},\n${fields
    .map(([k, v], i) => `  ${k.padEnd(width)} = {${v}}${i < fields.length - 1 ? "," : ""}`)
    .join("\n")}\n}`;
  const apaWho = PROJECT.author
    ? `The ${branding.displayName} contributors, & ${apaName(PROJECT.author)}`
    : `The ${branding.displayName} contributors`;
  const apa = `${apaWho}. (${year}). ${title} (Version ${BUILD.version}) [Computer software].${REPO ? ` ${REPO}` : ""}`;
  return { key, fields, width, bibtex, apa };
}

/** Keeps a person's name on one line (no break at the hyphen in "Yosif-Or"). */
function keepNames(v: string) {
  const name = PROJECT.author;
  const at = name ? v.indexOf(name) : -1;
  if (at < 0) return v;
  return (
    <>
      {v.slice(0, at)}
      <span className="nowrap">{name}</span>
      {v.slice(at + name.length)}
    </>
  );
}

function CiteCard() {
  const c = useMemo(citation, []);
  const [bibCopied, copyBib] = useCopied();
  const [apaCopied, copyApa] = useCopied();
  return (
    <section className="about-cite" aria-label={t("about.cite", { name: branding.displayName })}>
      <div className="about-cite-head">
        <Quote size={20} aria-hidden="true" className="about-cite-icon" />
        <div>
          <h3>{t("about.cite", { name: branding.displayName })}</h3>
          <p>{t("about.citeHint", { name: branding.displayName, key: c.key })}</p>
        </div>
      </div>
      <div className="about-bib">
        <pre aria-label="BibTeX">
          <span className="bib-type">@software</span>
          {"{"}
          <span className="bib-key">{c.key}</span>
          {",\n"}
          {c.fields.map(([k, v], i) => (
            <span key={k}>
              {"  "}
              <span className="bib-field">{k.padEnd(c.width)}</span>
              {" = {"}
              <span className="bib-value">{k === "author" ? keepNames(v) : v}</span>
              {"}"}
              {i < c.fields.length - 1 ? ",\n" : "\n"}
            </span>
          ))}
          {"}"}
        </pre>
        <button
          type="button"
          className="icon-btn about-bib-copy"
          aria-label={t("about.copyBibtex")}
          title={t("about.copyBibtex")}
          onClick={() => copyBib(c.bibtex)}
        >
          {bibCopied ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => copyApa(c.apa)}>
          {apaCopied ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}{" "}
          {apaCopied ? t("about.copied") : t("about.copyApa")}
        </button>
      </div>
    </section>
  );
}

/** Settings → Help & About. */
export function AboutSettings({ info }: { info: PlatformInfo }) {
  const [view, setView] = useState<"main" | "changelog">("main");
  const [copied, copy] = useCopied();
  const [msg, setMsg] = useState<string | null>(null);
  const os = t(`about.os.${info.os}`);
  const version = BUILD.commit
    ? t("about.versionBuild", { v: BUILD.version, commit: BUILD.commit, date: BUILD.date })
    : t("about.versionRelease", { v: BUILD.version });
  const systemInfo = [
    `${branding.displayName} ${BUILD.version}${BUILD.commit ? ` (${BUILD.commit}, ${BUILD.date})` : ""}`,
    `${os} · ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    `Library: ${info.library}`,
    `Keys: ${info.credentialStore}`,
  ].join("\n");
  const changes = useMemo(() => renderMarkdown(changelog.replace(/^# .*\n/, "")), []);

  if (view === "changelog")
    return (
      <div className="about">
        <button type="button" className="btn about-back" onClick={() => setView("main")}>
          <ArrowLeft size={14} aria-hidden="true" /> {t("about.back")}
        </button>
        <h2 className="about-sub">{t("about.whatsNew")}</h2>
        <article
          className="about-changelog md-preview"
          aria-label={t("about.whatsNew")}
          dangerouslySetInnerHTML={{ __html: changes }}
        />
      </div>
    );

  const report = () => {
    if (REPO) {
      // no library path in a public issue: version and system only
      const body = `**What happened**\n\n\n**What I expected**\n\n\n---\n${branding.displayName} ${BUILD.version}${BUILD.commit ? ` (${BUILD.commit})` : ""} · ${os}`;
      open(`${REPO}/issues/new?body=${encodeURIComponent(body)}`);
    } else {
      copy(systemInfo);
      setMsg(t("about.reportCopied"));
    }
  };

  return (
    <div className="about">
      {REPO && (
        <p className="about-banner">
          {t("about.starLead", { name: branding.displayName })}{" "}
          <a
            href={REPO}
            onClick={(e) => {
              e.preventDefault();
              open(REPO);
            }}
          >
            {t("about.starLink")}
          </a>
          {t("about.starTail")}
        </p>
      )}

      <section className="about-card" aria-label={branding.displayName}>
        <div className="about-card-text">
          <h2 className="about-name">
            <span className="about-wordmark">
              <b>{branding.wordmarkBold || branding.displayName}</b>
              {branding.wordmarkBold
                ? branding.displayName.slice(branding.wordmarkBold.length)
                : ""}
            </span>
            <span className="about-version">{version}</span>
          </h2>
          <p className="about-summary">{branding.summary}</p>
          <p className="about-credit">
            {PROJECT.author
              ? t("about.creditWith", { name: branding.displayName, author: PROJECT.author })
              : t("about.credit", { name: branding.displayName })}
            <br />
            <span className="about-copyright">
              © {(BUILD.date || new Date().toISOString()).slice(0, 4)}{" "}
              {PROJECT.author
                ? t("about.copyrightWith", { name: branding.displayName, author: PROJECT.author })
                : t("about.copyright", { name: branding.displayName })}
              {PROJECT.license ? ` · ${PROJECT.license}` : ""}
            </span>
          </p>
          <div className="about-actions">
            {REPO && (
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => open(`${REPO}/releases/latest`)}
              >
                <RefreshCw size={14} aria-hidden="true" /> {t("about.checkUpdates")}
              </button>
            )}
            <button type="button" className="btn-link" onClick={() => setView("changelog")}>
              <ScrollText size={14} aria-hidden="true" /> {t("about.whatsNew")}
            </button>
            <button type="button" className="btn-link" onClick={() => copy(systemInfo)}>
              {copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}{" "}
              {copied ? t("about.copied") : t("about.copyInfo")}
            </button>
          </div>
        </div>
        <img className="about-icon" src={logo2x} alt="" aria-hidden="true" draggable={false} />
      </section>
      {msg && (
        <div className="alert alert-info" role="status">
          {msg}
        </div>
      )}

      {(REPO || PROJECT.website) && (
        <Group title={t("about.project")}>
          {REPO && (
            <Row
              icon={Star}
              title={t("about.github")}
              detail={t("about.githubDetail")}
              external
              onClick={() => open(REPO)}
            />
          )}
          {PROJECT.website && (
            <Row
              icon={Globe}
              title={t("about.website")}
              detail={PROJECT.website.replace(/^https?:\/\//, "")}
              external
              onClick={() => open(PROJECT.website)}
            />
          )}
        </Group>
      )}

      <Group title={t("about.help")}>
        <Row
          icon={Compass}
          title={t("about.tour")}
          detail={t("about.tourDetail")}
          onClick={() => {
            useDialogs.getState().close();
            useTour.getState().start();
          }}
        />
        <Row
          icon={ScrollText}
          title={t("about.whatsNew")}
          detail={t("about.whatsNewDetail", { v: BUILD.version })}
          onClick={() => setView("changelog")}
        />
        <Row
          icon={Keyboard}
          title={t("about.shortcuts")}
          detail={t("about.shortcutsDetail")}
          onClick={() => useDialogs.getState().show("palette")}
        />
        <Row
          icon={TriangleAlert}
          title={t("about.report")}
          detail={REPO ? t("about.reportDetailRepo") : t("about.reportDetail")}
          external={!!REPO}
          onClick={report}
        />
        {PROJECT.license && (
          <Row
            icon={Scale}
            title={t("about.license")}
            detail={PROJECT.license}
            external
            onClick={() =>
              open(
                REPO
                  ? `${REPO}/blob/main/LICENSE`
                  : `https://spdx.org/licenses/${PROJECT.license}.html`,
              )
            }
          />
        )}
      </Group>

      <CiteCard />

      <section className="about-group" aria-label={t("about.thisComputer")}>
        <h3 className="field-label">{t("about.thisComputer")}</h3>
        <p className="about-privacy">{t("about.privacy")}</p>
        <dl className="about-facts">
          <dt>{t("about.system")}</dt>
          <dd>{os}</dd>
          <dt>{t("about.library")}</dt>
          <dd>
            <code className="path">{info.library}</code>
          </dd>
          <dt>{t("about.keys")}</dt>
          <dd>{info.credentialStore}</dd>
          <dt>{t("about.command")}</dt>
          <dd>
            <code>{branding.cliCommand}</code>
          </dd>
        </dl>
      </section>
      <p className="about-trademarks">{t("about.trademarks")}</p>
    </div>
  );
}
