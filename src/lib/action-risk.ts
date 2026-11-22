// Risk of the one-shot actions on the Cleaner and Fixes screens, on the same
// scale as the tweaks (see Risk in tweaks-catalog.ts). Risky actions never run
// as part of "Clean all" and ask for a confirmation on their own card.

import type { Text } from "@/lib/i18n";
import type { Risk } from "@/lib/tweaks-catalog";

export interface ActionRisk {
  risk: Risk;
  /** Required unless risk is safe: what the user may notice or lose. */
  note?: Text;
}

const safe: ActionRisk = { risk: "safe" };

export const ACTION_RISK: Record<string, ActionRisk> = {
  // Cleaner
  clean_temp: safe,
  flush_dns: safe,
  clean_thumbnails: safe,
  clean_browser_cache: safe,
  clean_discord_cache: safe,
  clean_steam_web_cache: safe,
  clean_delivery_optimization: safe,
  clean_windows_update: safe,
  clean_prefetch: {
    risk: "moderate",
    note: { pt: "Os apps abrem um pouco mais devagar na primeira vez depois da limpeza.", en: "Apps open a little slower the first time after the cleanup." },
  },
  clean_shader_cache: {
    risk: "moderate",
    note: { pt: "Os jogos refazem os shaders: as primeiras partidas podem ter travadas.", en: "Games rebuild their shaders: the first matches may stutter." },
  },
  clean_logs_minidumps: {
    risk: "moderate",
    note: { pt: "Some com os relatórios que ajudam a descobrir a causa de telas azuis.", en: "Removes the reports that help find the cause of blue screens." },
  },
  clean_recycle_bin: {
    risk: "risky",
    note: { pt: "Apaga de vez o que está na Lixeira. Não dá para recuperar.", en: "Permanently deletes what is in the Recycle Bin. It cannot be recovered." },
  },
  clean_windows_old: {
    risk: "risky",
    note: { pt: "Você perde a opção de voltar para a versão anterior do Windows.", en: "You lose the option to go back to the previous version of Windows." },
  },
  // Fixes
  sfc: safe,
  dism: safe,
  cache: safe,
  net: {
    risk: "moderate",
    note: { pt: "A internet cai até reiniciar o PC, e IP fixo configurado à mão é apagado.", en: "The internet drops until you restart, and a manually set static IP is cleared." },
  },
  update: {
    risk: "moderate",
    note: { pt: "Para o Windows Update por um momento e recomeça do zero os downloads pendentes.", en: "Stops Windows Update for a moment and restarts pending downloads from scratch." },
  },
};

export const riskOfAction = (id: string): ActionRisk => ACTION_RISK[id] ?? safe;
