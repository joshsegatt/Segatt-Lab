// The Fixes list: what each repair does, in words, and how long it takes.
// Behavior lives in src-tauri/src/features/system.rs (run_system_fix).

import type { Language } from "@/lib/i18n";

type Text = Record<Language, string>;

export interface FixDef { id: string; name: Text; description: Text; takes: Text }

/** DISM first: SFC repairs from the store DISM fixes. */
export const FIXES: FixDef[] = [
  {
    id: "dism",
    name: { pt: "Reparar a imagem do Windows (DISM)", en: "Repair the Windows image (DISM)" },
    description: { pt: "Baixa do Windows Update as peças danificadas da cópia de reserva do Windows. Rode antes do SFC.", en: "Downloads damaged pieces of Windows' backup copy from Windows Update. Run it before SFC." },
    takes: { pt: "10 a 30 min", en: "10 to 30 min" },
  },
  {
    id: "sfc",
    name: { pt: "Verificar arquivos do Windows (SFC)", en: "Check Windows files (SFC)" },
    description: { pt: "Confere cada arquivo do sistema e troca os danificados pela cópia boa.", en: "Checks every system file and replaces damaged ones with the good copy." },
    takes: { pt: "5 a 20 min", en: "5 to 20 min" },
  },
  {
    id: "net",
    name: { pt: "Redefinir a rede", en: "Reset the network" },
    description: { pt: "Volta Winsock e TCP/IP ao padrão e limpa o DNS. Para internet que não conecta.", en: "Puts Winsock and TCP/IP back to default and clears DNS. For internet that will not connect." },
    takes: { pt: "1 min, pede reiniciar", en: "1 min, needs a restart" },
  },
  {
    id: "update",
    name: { pt: "Redefinir o Windows Update", en: "Reset Windows Update" },
    description: { pt: "Guarda o cache atual como cópia e começa um novo. Para atualização que trava ou falha sempre.", en: "Keeps the current cache as a copy and starts a new one. For updates that hang or keep failing." },
    takes: { pt: "1 min", en: "1 min" },
  },
  {
    id: "cache",
    name: { pt: "Recriar o cache de ícones", en: "Rebuild the icon cache" },
    description: { pt: "Para ícones em branco ou trocados no Explorer e na barra de tarefas.", en: "For blank or wrong icons in Explorer and the taskbar." },
    takes: { pt: "segundos", en: "seconds" },
  },
];

/** Windows tools the app opens; must match ALLOWED_PANELS in system.rs. */
export const PANELS: { cmd: string; name: Text }[] = [
  { cmd: "devmgmt.msc", name: { pt: "Gerenciador de Dispositivos", en: "Device Manager" } },
  { cmd: "services.msc", name: { pt: "Serviços", en: "Services" } },
  { cmd: "diskmgmt.msc", name: { pt: "Gerenciamento de Disco", en: "Disk Management" } },
  { cmd: "ncpa.cpl", name: { pt: "Conexões de Rede", en: "Network Connections" } },
  { cmd: "powercfg.cpl", name: { pt: "Opções de Energia", en: "Power Options" } },
  { cmd: "sysdm.cpl", name: { pt: "Propriedades do Sistema", en: "System Properties" } },
  { cmd: "compmgmt.msc", name: { pt: "Gerenciamento do Computador", en: "Computer Management" } },
  { cmd: "control", name: { pt: "Painel de Controle", en: "Control Panel" } },
];

/** Why a repair failed, as an i18n key; null when the raw text is all there is. */
export function fixReason(msg: string): string | null {
  if (/administrator required|must be an administrator|precisa ser um administrador|\b740\b|0x2E4/i.test(msg)) return "fx.err_admin";
  if (/0x800f081f|0x800f0906|0x800f0950|source files could not be found|arquivos de origem/i.test(msg)) return "fx.err_source";
  if (/stopped after \d+ minutes/i.test(msg)) return "fx.err_timeout";
  return null;
}
