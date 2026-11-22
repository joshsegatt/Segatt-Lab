// What the Control screen offers. Behavior lives in src-tauri/src/features/control.rs;
// this file holds the words and the risk of each choice.

import type { Text } from "@/lib/i18n";
import type { Risk } from "./tweaks-catalog.ts";


export type UpdateMode = "default" | "security" | "manual" | "custom";

export interface UpdateModeDef {
  id: Exclude<UpdateMode, "custom">;
  risk: Risk;
  name: Text;
  description: Text;
  riskNote?: Text;
}

export const UPDATE_MODES: UpdateModeDef[] = [
  {
    id: "default",
    risk: "safe",
    name: { pt: "Padrão do Windows", en: "Windows default" },
    description: { pt: "O Windows baixa e instala tudo sozinho, como veio de fábrica.", en: "Windows downloads and installs everything by itself, as it shipped." },
  },
  {
    id: "security",
    risk: "moderate",
    name: { pt: "Só segurança", en: "Security only" },
    description: {
      pt: "Correções de segurança em até 4 dias; versões novas do Windows só depois de 1 ano.",
      en: "Security fixes within 4 days; new Windows versions only after a year.",
    },
    riskNote: {
      pt: "Drivers deixam de vir pelo Windows Update: atualize a placa de vídeo pelo app da AMD, NVIDIA ou Intel.",
      en: "Drivers stop coming through Windows Update: update the graphics card from the AMD, NVIDIA or Intel app.",
    },
  },
  {
    id: "manual",
    risk: "risky",
    name: { pt: "Manual", en: "Manual" },
    description: {
      pt: "Nada instala sozinho; você procura atualizações quando quiser em Configurações.",
      en: "Nothing installs by itself; you check for updates in Settings when you want.",
    },
    riskNote: {
      pt: "O Windows para de receber correções de segurança sozinho. Use por pouco tempo.",
      en: "Windows stops getting security fixes by itself. Use it only for a short time.",
    },
  },
];

export interface FeatureDef {
  /** Windows feature name; must match FEATURES in control.rs. */
  name: string;
  risk: Risk;
  title: Text;
  description: Text;
  riskNote?: Text;
  /** Shown (and confirmed) before turning the feature off. */
  offNote?: Text;
}

const HYPERVISOR: Text = {
  pt: "Liga o hipervisor do Windows: pode custar um pouco de FPS, e alguns anti-cheats e emuladores antigos reclamam.",
  en: "Turns on the Windows hypervisor: it can cost a little FPS, and some anti-cheats and old emulators complain.",
};

export const FEATURES: FeatureDef[] = [
  {
    name: "Microsoft-Windows-Subsystem-Linux",
    risk: "safe",
    title: { pt: "WSL (Linux no Windows)", en: "WSL (Linux on Windows)" },
    description: { pt: "Roda distribuições Linux no Windows. O WSL 2 também precisa da Plataforma de Máquina Virtual.", en: "Runs Linux distributions on Windows. WSL 2 also needs Virtual Machine Platform." },
    offNote: { pt: "Suas distribuições Linux param de abrir até você ligar de novo; os arquivos delas ficam.", en: "Your Linux distributions stop opening until you turn it back on; their files stay." },
  },
  {
    name: "VirtualMachinePlatform",
    risk: "moderate",
    title: { pt: "Plataforma de Máquina Virtual", en: "Virtual Machine Platform" },
    description: { pt: "Base do WSL 2 e do Android no Windows.", en: "Base for WSL 2 and Android on Windows." },
    riskNote: HYPERVISOR,
    offNote: { pt: "O WSL 2 e o Android no Windows param de funcionar depois de reiniciar.", en: "WSL 2 and Android on Windows stop working after the restart." },
  },
  {
    name: "Microsoft-Hyper-V-All",
    risk: "moderate",
    title: { pt: "Hyper-V", en: "Hyper-V" },
    description: { pt: "Máquinas virtuais completas do Windows. Só no Pro ou superior.", en: "Full Windows virtual machines. Pro or higher only." },
    riskNote: HYPERVISOR,
  },
  {
    name: "Containers-DisposableClientVM",
    risk: "moderate",
    title: { pt: "Área Restrita do Windows (Sandbox)", en: "Windows Sandbox" },
    description: { pt: "Um Windows descartável para abrir arquivos suspeitos. Só no Pro ou superior.", en: "A throwaway Windows to open suspicious files. Pro or higher only." },
    riskNote: HYPERVISOR,
  },
  {
    name: "NetFx3",
    risk: "safe",
    title: { pt: ".NET Framework 3.5", en: ".NET Framework 3.5" },
    description: { pt: "Jogos e apps antigos precisam dele. Baixa do Windows Update ao ativar.", en: "Older games and apps need it. Downloads from Windows Update when turned on." },
  },
];
