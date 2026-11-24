// LaTeX symbols for notes: what the palette shows and what `\` completes inside math.
import type { EditorState } from "@codemirror/state";

export interface LatexSymbol {
  /** Inserted text; `#` marks where the cursor goes (the first empty argument). */
  tex: string;
  /** How it looks (Unicode), for the palette and the completion list. */
  show: string;
  group: SymbolGroup;
}

export type SymbolGroup = "greek" | "operators" | "relations" | "arrows" | "sets" | "structure";
export const SYMBOL_GROUPS: SymbolGroup[] = [
  "greek",
  "operators",
  "relations",
  "arrows",
  "sets",
  "structure",
];

const g = (group: SymbolGroup, pairs: [string, string][]): LatexSymbol[] =>
  pairs.map(([tex, show]) => ({ tex, show, group }));

export const SYMBOLS: LatexSymbol[] = [
  ...g("greek", [
    ["\\alpha", "α"],
    ["\\beta", "β"],
    ["\\gamma", "γ"],
    ["\\delta", "δ"],
    ["\\epsilon", "ϵ"],
    ["\\varepsilon", "ε"],
    ["\\zeta", "ζ"],
    ["\\eta", "η"],
    ["\\theta", "θ"],
    ["\\vartheta", "ϑ"],
    ["\\iota", "ι"],
    ["\\kappa", "κ"],
    ["\\lambda", "λ"],
    ["\\mu", "μ"],
    ["\\nu", "ν"],
    ["\\xi", "ξ"],
    ["\\pi", "π"],
    ["\\rho", "ρ"],
    ["\\sigma", "σ"],
    ["\\tau", "τ"],
    ["\\upsilon", "υ"],
    ["\\phi", "ϕ"],
    ["\\varphi", "φ"],
    ["\\chi", "χ"],
    ["\\psi", "ψ"],
    ["\\omega", "ω"],
    ["\\Gamma", "Γ"],
    ["\\Delta", "Δ"],
    ["\\Theta", "Θ"],
    ["\\Lambda", "Λ"],
    ["\\Xi", "Ξ"],
    ["\\Pi", "Π"],
    ["\\Sigma", "Σ"],
    ["\\Phi", "Φ"],
    ["\\Psi", "Ψ"],
    ["\\Omega", "Ω"],
  ]),
  ...g("operators", [
    ["\\frac{#}{}", "a⁄b"],
    ["\\sqrt{#}", "√"],
    ["^{#}", "x²"],
    ["_{#}", "xᵢ"],
    ["\\sum_{#}^{}", "∑"],
    ["\\prod_{#}^{}", "∏"],
    ["\\int_{#}^{}", "∫"],
    ["\\oint", "∮"],
    ["\\iint", "∬"],
    ["\\lim_{#}", "lim"],
    ["\\partial", "∂"],
    ["\\nabla", "∇"],
    ["\\infty", "∞"],
    ["\\pm", "±"],
    ["\\mp", "∓"],
    ["\\times", "×"],
    ["\\cdot", "·"],
    ["\\div", "÷"],
    ["\\ast", "∗"],
    ["\\circ", "∘"],
    ["\\otimes", "⊗"],
    ["\\oplus", "⊕"],
    ["\\dagger", "†"],
    ["\\hbar", "ℏ"],
    ["\\ell", "ℓ"],
    ["\\degree", "°"],
    ["\\langle #\\rangle", "⟨⟩"],
    ["\\lvert #\\rvert", "|x|"],
    ["\\lVert #\\rVert", "‖x‖"],
  ]),
  ...g("relations", [
    ["\\leq", "≤"],
    ["\\geq", "≥"],
    ["\\neq", "≠"],
    ["\\approx", "≈"],
    ["\\equiv", "≡"],
    ["\\sim", "∼"],
    ["\\simeq", "≃"],
    ["\\cong", "≅"],
    ["\\propto", "∝"],
    ["\\ll", "≪"],
    ["\\gg", "≫"],
    ["\\perp", "⊥"],
    ["\\parallel", "∥"],
    ["\\mid", "∣"],
    ["\\coloneqq", "≔"],
  ]),
  ...g("arrows", [
    ["\\to", "→"],
    ["\\leftarrow", "←"],
    ["\\leftrightarrow", "↔"],
    ["\\Rightarrow", "⇒"],
    ["\\Leftarrow", "⇐"],
    ["\\Leftrightarrow", "⇔"],
    ["\\implies", "⟹"],
    ["\\iff", "⟺"],
    ["\\mapsto", "↦"],
    ["\\uparrow", "↑"],
    ["\\downarrow", "↓"],
    ["\\rightleftharpoons", "⇌"],
  ]),
  ...g("sets", [
    ["\\in", "∈"],
    ["\\notin", "∉"],
    ["\\subset", "⊂"],
    ["\\subseteq", "⊆"],
    ["\\supset", "⊃"],
    ["\\cup", "∪"],
    ["\\cap", "∩"],
    ["\\setminus", "∖"],
    ["\\emptyset", "∅"],
    ["\\forall", "∀"],
    ["\\exists", "∃"],
    ["\\neg", "¬"],
    ["\\land", "∧"],
    ["\\lor", "∨"],
    ["\\mathbb{R}", "ℝ"],
    ["\\mathbb{C}", "ℂ"],
    ["\\mathbb{N}", "ℕ"],
    ["\\mathbb{Z}", "ℤ"],
    ["\\mathbb{Q}", "ℚ"],
  ]),
  ...g("structure", [
    ["\\hat{#}", "x̂"],
    ["\\bar{#}", "x̄"],
    ["\\vec{#}", "x⃗"],
    ["\\dot{#}", "ẋ"],
    ["\\ddot{#}", "ẍ"],
    ["\\tilde{#}", "x̃"],
    ["\\overline{#}", "x̅"],
    ["\\mathbf{#}", "𝐱"],
    ["\\mathrm{#}", "x"],
    ["\\mathcal{#}", "𝒳"],
    ["\\text{#}", "Tt"],
    ["\\left( # \\right)", "( )"],
    ["\\left[ # \\right]", "[ ]"],
    ["\\begin{pmatrix} # \\end{pmatrix}", "( ⋮ )"],
    ["\\begin{aligned} # \\end{aligned}", "≡ ≡"],
    ["\\quad", "␣␣"],
  ]),
];

/** The command name a symbol is completed by (`\frac{#}{}` → `\frac`). */
export function commandOf(s: LatexSymbol): string {
  return s.tex.match(/^\\[A-Za-z]+/)?.[0] ?? s.tex.replace("#", "");
}

/** Text to insert and where the cursor lands in it (at `#`, else the end). */
export function insertionOf(tex: string): { text: string; cursor: number } {
  const at = tex.indexOf("#");
  return at < 0 ? { text: tex, cursor: tex.length } : { text: tex.replace("#", ""), cursor: at };
}

/**
 * Whether `pos` is inside math: between `$$` fences (any lines), or between single `$` on its
 * line. A `\$` is a literal dollar.
 */
export function inMath(state: EditorState, pos: number): boolean {
  const before = state.doc.sliceString(0, pos).replace(/\\\$/g, "");
  const fences = before.match(/\$\$/g)?.length ?? 0;
  if (fences % 2 === 1) return true;
  const line = state.doc.lineAt(pos);
  const head = state.doc.sliceString(line.from, pos).replace(/\\\$/g, "").replace(/\$\$/g, "");
  return (head.match(/\$/g)?.length ?? 0) % 2 === 1;
}
