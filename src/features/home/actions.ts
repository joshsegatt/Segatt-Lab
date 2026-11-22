import type { Language } from "@/lib/i18n";
import type { TweakState } from "@/hooks/useTweakStates";
import type { Action } from "@/lib/search";
import { APP_CATEGORIES } from "@/lib/app-categories";
import { PRESETS, TWEAKS } from "@/lib/tweaks-catalog";
import { presetForPc, type Hardware } from "@/lib/hardware";
import { fmt } from "@/lib/fmt";
import { CLEANUPS } from "@/lib/cleanup";
import { FIXES as FIX_DEFS } from "@/lib/fixes";
import { riskOfAction } from "@/lib/action-risk";
import { showsAction, showsTweak, type Level } from "@/lib/level";
import { localize } from "@/lib/i18n";

type T = (path: string) => string;

// Cleaner task ids (src-tauri cleaner.rs) and their label keys in i18n.
const CLEANUP: [id: string, keywords: string][] = [
  ["clean_temp", "temporarios temp arquivos files espaco space"],
  ["clean_windows_update", "update atualizacao cache espaco"],
  ["clean_prefetch", "prefetch"],
  ["flush_dns", "dns internet rede network"],
  ["clean_shader_cache", "shader directx nvidia amd jogo game travadas stutter"],
  ["clean_recycle_bin", "lixeira recycle"],
  ["clean_windows_old", "windows.old espaco space"],
  ["clean_delivery_optimization", "delivery otimizacao entrega"],
  ["clean_thumbnails", "miniaturas thumbnails icones"],
  ["clean_logs_minidumps", "logs dumps"],
  ["clean_browser_cache", "navegador browser chrome edge brave firefox cache"],
  ["clean_discord_cache", "discord cache"],
  ["clean_steam_web_cache", "steam cache loja store"],
  ["clean_dev_package_caches", "npm yarn pip nuget pacotes packages programacao dev cache"],
  ["clean_vscode_cache", "vscode vs code programacao dev cache"],
  ["clean_gradle_cache", "gradle android java programacao dev cache"],
  ["clean_old_ide_versions", "android studio jetbrains intellij ide antigas old programacao dev"],
  ["clean_old_android_sdk", "android sdk ndk build-tools antigo old programacao dev"],
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
const FIXES: [id: string, keywords: string][] = [
  ["sfc", "sfc corrompido corrupt arquivos sistema"],
  ["dism", "dism imagem image"],
  ["net", "rede network internet winsock"],
  ["update", "windows update atualizacao"],
  ["cache", "icones icons cache"],
];

export function buildActions(lang: Language, t: T, states?: Record<string, TweakState> | null, hw: Hardware | null = null, level: Level = "advanced"): Action[] {
  const presets: Action[] = PRESETS.map((p) => {
    const ids = presetForPc(p.key, hw).map((tw) => tw.id);
    const count = ids.length;
    const pending = states ? ids.filter((id) => states[id]?.status !== "active").length : null;
    return {
      id: `preset:${p.key}`,
      kind: "preset",
      title: localize(p.name, lang),
      subtitle: pending === null ? fmt(t("home.preset_sub"), { n: count }) : fmt(t("home.preset_sub_pending"), { p: pending, n: count }),
      href: `/tweaks?preset=${p.key}`,
      keywords: p.keywords,
    };
  });

  const tweaks: Action[] = TWEAKS.filter((tw) => showsTweak(level, tw.risk, states?.[tw.id]?.status === "active")).map((tw) => ({
    id: `tweak:${tw.id}`,
    kind: "tweak",
    title: localize(tw.name, lang),
    subtitle: localize(tw.description, lang),
    href: `/tweaks?select=${tw.id}`,
    keywords: `${tw.name.pt} ${tw.name.en} ${tw.keywords ?? ""}`,
  }));

  const apps: Action[] = APP_CATEGORIES.flatMap((cat) =>
    cat.apps.map((app) => ({
      id: `app:${app.id}`,
      kind: "app" as const,
      title: app.name,
      subtitle: localize(app.description, lang),
      href: `/install?q=${encodeURIComponent(app.name)}`,
      keywords: `${app.id} ${cat.label.pt} ${cat.label.en} ${CATEGORY_WORDS[cat.key] ?? ""} ${app.description.pt} ${app.description.en}`,
    })),
  );

  const cleanup: Action[] = CLEANUP.filter(([id]) => showsAction(level, riskOfAction(id).risk)).map(([id, keywords]) => ({
    id: `cleanup:${id}`,
    kind: "cleanup",
    title: localize(CLEANUPS.find((c) => c.id === id)?.name, lang) ?? id,
    subtitle: t("home.cleanup_sub"),
    href: "/cleaner",
    keywords: `limpar limpeza clean ${keywords}`,
  }));

  const fixes: Action[] = FIXES.map(([id, keywords]) => ({
    id: `fix:${id}`,
    kind: "fix",
    title: localize(FIX_DEFS.find((f) => f.id === id)?.name, lang) ?? id,
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
    ["profile", "/profile", "screen_profile", "perfil profile exportar export importar import backup outro pc"],
    ["debloat", "/debloat", "screen_debloat", "debloat bloatware remover remove apps copilot xbox onedrive teams lixo"],
    ["startup", "/startup", "screen_startup", "inicializacao startup boot abrir com o windows iniciar programas lento lenta"],
    ["usb", "/usb", "screen_usb", "pendrive usb boot bootavel iso rufus formatar instalar windows 11 linux ubuntu"],
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
