// Local action search behind the Home composer. No AI and no network: it matches the
// words typed against every action the app can take (presets, tweaks, apps, cleanup,
// fixes, screens), ignoring accents and case, with Portuguese and English keywords.

export type ActionKind = "preset" | "tweak" | "app" | "cleanup" | "fix" | "screen";

export interface Action {
  id: string;
  kind: ActionKind;
  title: string;
  subtitle: string;
  href: string;
  keywords?: string;
}

export interface SearchResult {
  lead: Action | null;
  groups: { kind: Exclude<ActionKind, "preset">; items: Action[] }[];
  total: number;
}

const KIND_WEIGHT: Record<ActionKind, number> = { preset: 40, tweak: 20, cleanup: 16, fix: 16, app: 12, screen: 6 };
const GROUP_ORDER: Exclude<ActionKind, "preset">[] = ["tweak", "app", "cleanup", "fix", "screen"];
const GROUP_LIMIT: Record<Exclude<ActionKind, "preset">, number> = { tweak: 3, app: 2, cleanup: 2, fix: 2, screen: 2 };

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function words(text: string): string[] {
  return normalize(text).split(/[^a-z0-9.+]+/).filter(Boolean);
}

/** Score of one action for the query tokens, or 0 when a token does not match. */
export function scoreAction(action: Action, tokens: string[]): number {
  const titleWords = words(action.title);
  const allWords = [...titleWords, ...words(action.subtitle), ...words(action.keywords ?? "")];
  let score = 0;
  for (const token of tokens) {
    const inTitle = titleWords.some((w) => w.startsWith(token));
    const anywhere = inTitle || allWords.some((w) => w.startsWith(token) || (token.length >= 3 && w.includes(token)));
    if (!anywhere) return 0;
    score += inTitle ? 10 : 4;
  }
  if (normalize(action.title).startsWith(tokens.join(" "))) score += 25;
  return score + KIND_WEIGHT[action.kind];
}

export function searchActions(query: string, actions: Action[]): SearchResult {
  const tokens = words(query);
  if (tokens.length === 0) return { lead: null, groups: [], total: 0 };

  const ranked = actions
    .map((action) => ({ action, score: scoreAction(action, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.action.title.localeCompare(b.action.title));

  const lead = ranked.find((r) => r.action.kind === "preset")?.action ?? null;
  const groups = GROUP_ORDER.map((kind) => ({
    kind,
    items: ranked.filter((r) => r.action.kind === kind).slice(0, GROUP_LIMIT[kind]).map((r) => r.action),
  })).filter((g) => g.items.length > 0);

  return { lead, groups, total: (lead ? 1 : 0) + groups.reduce((n, g) => n + g.items.length, 0) };
}

/** Flat list in display order, for keyboard navigation. */
export function flattenResult(result: SearchResult): Action[] {
  return [...(result.lead ? [result.lead] : []), ...result.groups.flatMap((g) => g.items)];
}
