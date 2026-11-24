// Contribution registry: features register commands; the palette and shortcuts read them.
export interface Command {
  id: string;
  title: string;
  group?: string;
  /** "mod+k", "mod+shift+p". `mod` is Cmd on macOS and Ctrl elsewhere. */
  shortcut?: string;
  keywords?: string[];
  /** Hidden from the palette when this returns false. */
  when?: () => boolean;
  run: () => void;
}

export interface SidebarTab {
  id: string;
  title: string;
}

export class Registry {
  private commands = new Map<string, Command>();
  private tabs = new Map<string, SidebarTab>();

  registerCommand(c: Command): () => void {
    this.commands.set(c.id, c);
    return () => {
      if (this.commands.get(c.id) === c) this.commands.delete(c.id);
    };
  }
  registerTab(t: SidebarTab) {
    this.tabs.set(t.id, t);
  }
  listCommands(): Command[] {
    return [...this.commands.values()].filter((c) => !c.when || c.when());
  }
  listTabs() {
    return [...this.tabs.values()];
  }
}

/**
 * Subsequence match score for palette filtering; null when `query` is not a subsequence.
 * Rewards consecutive matches and matches at word starts.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    score += found === prev + 1 ? 3 : 1;
    if (found === 0 || /[\s/:._-]/.test(t[found - 1])) score += 2;
    prev = found;
    ti = found + 1;
  }
  return score - t.length * 0.01;
}
