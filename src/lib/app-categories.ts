// Curated app catalog (winget ids). Every label and description exists in every
// shipped language, so a screen never mixes languages.

import type { Text } from "@/lib/i18n";

type T = Text;

export interface AppEntry {
  id: string; // winget package id
  name: string;
  description: T;
  foss?: boolean;
}

export interface AppCategory {
  key: string;
  label: T;
  apps: AppEntry[];
}

const app = (id: string, name: string, pt: string, en: string, foss = false): AppEntry => ({ id, name, description: { pt, en }, foss });

export const APP_CATEGORIES: AppCategory[] = [
  {
    key: "gaming",
    label: { pt: "Jogos", en: "Gaming" },
    apps: [
      app("Valve.Steam", "Steam", "A maior plataforma de jogos para PC", "The largest PC gaming platform"),
      app("Discord.Discord", "Discord", "Voz e chat para jogar em grupo", "Voice and chat for gaming together"),
      app("Nvidia.GeForceExperience", "GeForce Experience", "Drivers e otimização para placas NVIDIA", "Drivers and tuning for NVIDIA cards"),
      app("EpicGames.EpicGamesLauncher", "Epic Games", "Loja com jogos grátis toda semana", "Store with free games every week"),
      app("Blizzard.BattleNet", "Battle.net", "Launcher dos jogos da Blizzard", "Blizzard's game launcher"),
      app("Ubisoft.Connect", "Ubisoft Connect", "Launcher dos jogos da Ubisoft", "Ubisoft's game launcher"),
      app("ElectronicArts.EADesktop", "EA App", "Plataforma de jogos da EA", "EA's gaming platform"),
      app("Unity.UnityHub", "Unity Hub", "Gerencia versões da engine Unity", "Manages Unity engine versions"),
    ],
  },
  {
    key: "browsers",
    label: { pt: "Navegadores", en: "Browsers" },
    apps: [
      app("Google.Chrome", "Google Chrome", "Navegador rápido do Google", "Google's fast web browser"),
      app("Mozilla.Firefox", "Firefox", "Navegador aberto focado em privacidade", "Open-source, privacy-focused browser", true),
      app("Brave.Brave", "Brave", "Chromium com bloqueio de anúncios", "Chromium with built-in ad blocking", true),
      app("Microsoft.Edge", "Edge", "Navegador integrado da Microsoft", "Microsoft's built-in browser"),
      app("Opera.OperaGX", "Opera GX", "Navegador feito para gamers", "The browser made for gamers"),
      app("Vivaldi.Vivaldi", "Vivaldi", "Navegador muito personalizável", "Highly customizable browser"),
      app("LibreWolf.LibreWolf", "LibreWolf", "Firefox reforçado para privacidade", "Privacy-hardened Firefox fork", true),
      app("TheBrowserCompany.Arc", "Arc Browser", "Navegador moderno com espaços de trabalho", "Modern, workspace-based browser"),
      app("Ablaze.Floorp", "Floorp", "Derivado rápido e personalizável do Firefox", "Fast, customizable Firefox derivative", true),
      app("Alex313031.Thorium", "Thorium", "Chromium otimizado para velocidade", "Speed-optimized Chromium", true),
      app("Waterfox.Waterfox", "Waterfox", "Variante rápida do Firefox", "Fast Firefox variant", true),
    ],
  },
  {
    key: "hardware",
    label: { pt: "Hardware", en: "Hardware" },
    apps: [
      app("REALiX.HWiNFO", "HWiNFO", "Monitora temperaturas e sensores", "Monitors temperatures and sensors"),
      app("CPUID.CPU-Z", "CPU-Z", "Detalhes do processador e da memória", "Processor and memory details"),
      app("TechPowerUp.GPU-Z", "GPU-Z", "Detalhes da placa de vídeo", "Graphics card details"),
      app("CrystalMarkSoftware.CrystalDiskInfo", "CrystalDiskInfo", "Saúde dos discos e SSDs", "Drive and SSD health", true),
      app("AntibodySoftware.WizTree", "WizTree", "Mostra o que ocupa espaço no disco", "Shows what fills your disk"),
      app("MSI.Afterburner", "MSI Afterburner", "Overclock e monitor da GPU", "GPU overclocking and monitoring"),
      app("Maxon.Cinebench", "Cinebench", "Benchmark padrão de CPU", "Industry-standard CPU benchmark"),
      app("UL.3DMark", "3DMark", "Benchmark de GPU para jogos", "The gamer's GPU benchmark"),
    ],
  },
  {
    key: "media",
    label: { pt: "Mídia e stream", en: "Media and streaming" },
    apps: [
      app("VideoLAN.VLC", "VLC", "Toca qualquer vídeo ou áudio", "Plays any video or audio", true),
      app("Spotify.Spotify", "Spotify", "Música e podcasts", "Music and podcasts"),
      app("OBSProject.OBSStudio", "OBS Studio", "Grava e transmite a tela", "Records and streams your screen", true),
      app("GIMP.GIMP", "GIMP", "Editor de imagens completo", "Full image editor", true),
      app("Blender.Blender", "Blender", "Criação 3D completa", "Complete 3D creation suite", true),
      app("HandBrake.HandBrake", "HandBrake", "Converte e comprime vídeos", "Converts and compresses video", true),
      app("Streamlabs.StreamlabsDesktop", "Streamlabs", "Tudo para fazer live num app", "All-in-one streaming app"),
    ],
  },
  {
    key: "utilities",
    label: { pt: "Utilitários", en: "Utilities" },
    apps: [
      app("Microsoft.PowerToys", "PowerToys", "Ferramentas extras para o Windows", "Extra tools for Windows", true),
      app("Notepad++.Notepad++", "Notepad++", "Editor de texto leve", "Lightweight text editor", true),
      app("7zip.7zip", "7-Zip", "Compacta e extrai arquivos", "Compresses and extracts archives", true),
      app("RevoUninstaller.RevoUninstaller", "Revo Uninstaller", "Remove programas sem deixar restos", "Uninstalls without leftovers"),
      app("voidtools.Everything", "Everything", "Acha qualquer arquivo na hora", "Finds any file instantly"),
      app("Bitwarden.Bitwarden", "Bitwarden", "Gerenciador de senhas aberto", "Open-source password manager", true),
      app("Akeo.Rufus", "Rufus", "Cria pendrives de boot", "Creates bootable USB drives", true),
      app("BleachBit.BleachBit", "BleachBit", "Limpa rastros e arquivos inúteis", "Cleans traces and junk files", true),
    ],
  },
];

export const ALL_APPS: AppEntry[] = APP_CATEGORIES.flatMap((c) => c.apps);
