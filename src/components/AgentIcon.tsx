// The AI assistants' icons, from Lobe Icons (https://github.com/lobehub/lobe-icons, MIT licence;
// see src/assets/agents/LICENSE-lobe-icons.txt). The names and logos are trademarks of their
// owners, shown only to say which tools Paperlines works with.
import antigravity from "../assets/agents/antigravity.svg?raw";
import claudeCode from "../assets/agents/claude-code.svg?raw";
import claudeDesktop from "../assets/agents/claude-desktop.svg?raw";
import codex from "../assets/agents/codex.svg?raw";
import cursor from "../assets/agents/cursor.svg?raw";
import geminiCli from "../assets/agents/gemini-cli.svg?raw";
import grok from "../assets/agents/grok.svg?raw";

/** By the agents' ids (claude, codex) and Settings ▸ AI Assistants' ids. */
const ICONS: Record<string, string> = {
  claude: claudeCode,
  "claude-code": claudeCode,
  "claude-desktop": claudeDesktop,
  codex,
  "gemini-cli": geminiCli,
  gemini: geminiCli,
  antigravity,
  grok,
  cursor,
};

// the files are part of the app (not user content), so placing them in the page is safe; inline,
// the one-colour icons (Grok, Cursor) take the text colour in light and dark mode
const strip = (svg: string) => svg.replace(/<title>[^<]*<\/title>/, "");

export function AgentIcon({ agent, size = 15 }: { agent: string; size?: number }) {
  const svg = ICONS[agent];
  if (!svg) return null;
  return (
    <span
      className={`agent-icon agent-icon-${agent}`}
      style={{ fontSize: size, width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: strip(svg) }}
    />
  );
}
