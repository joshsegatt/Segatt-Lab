import type { Language } from "@/lib/i18n";
import type { TweakState } from "@/hooks/useTweakStates";
import type { Action } from "@/lib/search";
import { APP_CATEGORIES } from "@/lib/app-categories";
import { PRESETS, TWEAKS, tweaksInPreset } from "@/lib/tweaks-catalog";
import { fmt } from "@/lib/fmt";

type T = (path: string) => string;

// Cleaner task ids (src-tauri cleaner.rs) and their label keys in i18n.
const CLEANUP: [id: string, labelKey: string, keywords: string][] = [
  ["clean_temp", "temp", "temporarios temp arquivos files espaco space"],
  ["clean_windows_update", "win_update", "update atualizacao cache espaco"],
  ["clean_prefetch", "prefetch", "prefetch"],
  ["flush_dns", "dns", "dns internet rede network"],
  ["clean_shader_cache", "shader", "shader directx nvidia amd jogo game travadas stutter"],
  ["clean_recycle_bin", "recycle_bin", "lixeira recycle"],
  ["clean_windows_old", "win_old", "windows.old espaco space"],
  ["clean_delivery_optimization", "delivery_opt", "delivery otimizacao entrega"],
  ["clean_thumbnails", "thumbnails", "miniaturas thumbnails icones"],
  ["clean_logs_minidumps", "logs", "logs dumps"],
];

// Extra words for the app categories, so "jogo" finds Steam.
const CATEGORY_WORDS: Record<string, string> = {
  browsers: "navegador navegadores internet",
  hardware: "placa video gpu drivers monitoramento",
  gaming: "jogo jogos games gamer",
  media: "midia musica video audio",
  utilities: "utilitarios ferramentas tools",
};

// Fix ids (src-tauri system.rs) and their label keys in i18n.
const FIXES: [id: string, labelKey: string, keywords: string][] = [
  ["sfc", "sfc_scan", "sfc corrompido corrupt arquivos sistema"],
  ["dism", "dism_repair", "dism imagem image"],
  ["net", "net_reset", "rede network internet winsock"],
  ["update", "update_reset", "windows update atualizacao"],
  ["cache", "clear_cache", "icones icons cache"],
];

export function buildActions(lang: Language, t: T, states?: Record<string, TweakState> | null): Action[] {
  const presets: Action[] = PRESETS.map((p) => {
    const ids = tweaksInPreset(p.key).map((tw) => tw.id);
    const count = ids.length;
    const pending = states ? ids.filter((id) => states[id]?.status !== "active").length : null;
    return {
      id: `preset:${p.key}`,
      kind: "preset",
      title: p.name[lang],
      subtitle: pending === null ? fmt(t("home.preset_sub"), { n: count }) : fmt(t("home.preset_sub_pending"), { p: pending, n: count }),
      href: `/tweaks?preset=${p.key}`,
      keywords: p.keywords,
    };
  });

  const tweaks: Action[] = TWEAKS.map((tw) => ({
    id: `tweak:${tw.id}`,
    kind: "tweak",
    title: tw.name[lang],
    subtitle: tw.description[lang],
    href: `/tweaks?select=${tw.id}`,
    keywords: `${tw.name.pt} ${tw.name.en} ${tw.keywords ?? ""}`,
  }));

  const apps: Action[] = APP_CATEGORIES.flatMap((cat) =>
    cat.apps.map((app) => ({
      id: `app:${app.id}`,
      kind: "app" as const,
      title: app.name,
      subtitle: app.description[lang],
      href: `/install?q=${encodeURIComponent(app.name)}`,
      keywords: `${app.id} ${cat.label.pt} ${cat.label.en} ${CATEGORY_WORDS[cat.key] ?? ""} ${app.description.pt} ${app.description.en}`,
    })),
  );

  const cleanup: Action[] = CLEANUP.map(([id, key, keywords]) => ({
    id: `cleanup:${id}`,
    kind: "cleanup",
    title: t(`cleaner.items.${key}`),
    subtitle: t("home.cleanup_sub"),
    href: "/cleaner",
    keywords: `limpar limpeza clean ${keywords}`,
  }));

  const fixes: Action[] = FIXES.map(([id, key, keywords]) => ({
    id: `fix:${id}`,
    kind: "fix",
    title: t(`fixes.${key}`),
    subtitle: t("home.fix_sub"),
    href: "/fixes",
    keywords: `reparar reparo repair fix ${keywords}`,
  }));

  const screens: Action[] = [
    ["apps", "/install", "screen_apps", "instalar install programas software"],
    ["tweaks", "/tweaks", "screen_tweaks", "ajustes tweaks otimizar optimize"],
    ["cleaner", "/cleaner", "screen_cleaner", "limpar clean espaco space"],
    ["fixes", "/fixes", "screen_fixes", "reparar repair consertar"],
    ["control", "/config", "screen_control", "controle control recursos features"],
  ].map(([key, href, sub, keywords]) => ({
    id: `screen:${key}`,
    kind: "screen" as const,
    title: t(`nav.${key}`),
    subtitle: t(`home.${sub}`),
    href,
    keywords,
  }));

  return [...presets, ...tweaks, ...apps, ...cleanup, ...fixes, ...screens];
}
