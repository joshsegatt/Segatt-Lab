// The Cleaner list: what each task removes, in words, and which ones start
// picked. Behavior and sizes live in src-tauri/src/features/cleaner.rs.
// Pure functions: tested in Node.

// Relative with extension so the Node test runner can load them too.
import { localeTag, type Language, type Text } from "./i18n.ts";
import { riskOfAction } from "./action-risk.ts";

export interface CleanupDef { id: string; name: Text; description: Text }

export const CLEANUPS: CleanupDef[] = [
  { id: "clean_temp", name: { pt: "Arquivos temporários", en: "Temporary files" }, description: { pt: "Sobras de instaladores e apps, na sua conta e no Windows.", en: "Leftovers from installers and apps, in your account and in Windows." } },
  { id: "clean_shader_cache", name: { pt: "Cache de shaders", en: "Shader cache" }, description: { pt: "Shaders salvos pela placa de vídeo (DirectX, NVIDIA, AMD). Os jogos refazem na próxima vez.", en: "Shaders saved by the graphics card (DirectX, NVIDIA, AMD). Games rebuild them next time." } },
  { id: "clean_thumbnails", name: { pt: "Miniaturas", en: "Thumbnails" }, description: { pt: "Prévias de fotos e vídeos do Explorer. Voltam quando você abre a pasta.", en: "Explorer previews of photos and videos. They come back when you open the folder." } },
  { id: "clean_windows_update", name: { pt: "Downloads do Windows Update", en: "Windows Update downloads" }, description: { pt: "Atualizações já baixadas. O Windows baixa de novo o que ainda faltar.", en: "Updates already downloaded. Windows downloads again whatever is still missing." } },
  { id: "clean_delivery_optimization", name: { pt: "Cache de entrega do Windows", en: "Windows delivery cache" }, description: { pt: "Pedaços de atualização guardados para compartilhar com outros PCs.", en: "Update pieces kept to share with other PCs." } },
  { id: "clean_logs_minidumps", name: { pt: "Logs e despejos de erro", en: "Logs and crash dumps" }, description: { pt: "Despejos de tela azul e logs do Windows com mais de 7 dias.", en: "Blue screen dumps and Windows logs older than 7 days." } },
  { id: "clean_prefetch", name: { pt: "Prefetch", en: "Prefetch" }, description: { pt: "Atalhos que o Windows guarda para abrir apps mais rápido. Ele refaz sozinho.", en: "Shortcuts Windows keeps to open apps faster. It rebuilds them by itself." } },
  { id: "flush_dns", name: { pt: "Cache de DNS", en: "DNS cache" }, description: { pt: "Endereços de sites lembrados. Ajuda quando um site não abre depois de mudar de rede.", en: "Remembered site addresses. Helps when a site will not load after changing networks." } },
  { id: "clean_recycle_bin", name: { pt: "Lixeira", en: "Recycle Bin" }, description: { pt: "Esvazia a Lixeira de todos os discos.", en: "Empties the Recycle Bin on every drive." } },
  { id: "clean_windows_old", name: { pt: "Windows anterior (Windows.old)", en: "Previous Windows (Windows.old)" }, description: { pt: "A cópia do Windows guardada depois de uma atualização grande.", en: "The copy of Windows kept after a big update." } },
];

/**
 * Starts picked: safe tasks that would free something (DNS frees no files but
 * is harmless). Moderate and risky ones wait for the person.
 */
export function startsPicked(id: string, bytes: number | null | undefined): boolean {
  if (riskOfAction(id).risk !== "safe") return false;
  return bytes === null || (bytes ?? 0) > 0;
}

/** Sizes the way Explorer shows them: binary units, "GB" labels, one decimal from GB up. */
export function formatBytes(bytes: number, lang: Language): string {
  const KB = 1024, MB = KB * 1024, GB = MB * 1024;
  const num = (n: number, digits: number) => n.toLocaleString(localeTag(lang), { maximumFractionDigits: digits });
  if (bytes >= GB) return `${num(bytes / GB, 1)} GB`;
  if (bytes >= MB) return `${num(Math.round(bytes / MB), 0)} MB`;
  if (bytes > 0) return `${num(Math.max(1, Math.round(bytes / KB)), 0)} KB`;
  return "0 KB";
}
