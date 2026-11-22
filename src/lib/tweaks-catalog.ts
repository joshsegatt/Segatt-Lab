// The tweaks the Rust backend knows how to apply (src-tauri/src/features/tweaks.rs).
// Every id here must exist there; the Rust test `specs_match_the_frontend_catalog` checks it.

import type { Text } from "@/lib/i18n";

export type TweakGroup = "privacy" | "performance" | "interface" | "system";
export type PresetKey = "essential" | "privacy" | "gaming";

/**
 * How much can go wrong. safe: only does what it says. moderate: has a side
 * effect you may notice (riskNote says which). risky: can leave the PC less
 * safe or unstable; asks for confirmation and always makes a restore point.
 */
export type Risk = "safe" | "moderate" | "risky";

export interface TweakDef {
  id: string;
  risk: Risk;
  /** Required unless risk is safe: what the user may notice or lose. */
  riskNote?: Text;
  group: TweakGroup;
  presets?: PresetKey[];
  name: Text;
  description: Text;
  /** Extra search words in both languages. */
  keywords?: string;
}

export const TWEAKS: TweakDef[] = [
  { id: "disable_telemetry", risk: "safe", group: "privacy", presets: ["essential", "privacy"], keywords: "dados diagnostico microsoft data",
    name: { pt: "Desativar telemetria", en: "Disable telemetry" },
    description: { pt: "Para o envio de dados de diagnóstico para a Microsoft.", en: "Stops sending diagnostic data to Microsoft." } },
  { id: "disable_cortana", risk: "safe", group: "privacy", presets: ["privacy"], keywords: "assistente assistant",
    name: { pt: "Desativar Cortana", en: "Disable Cortana" },
    description: { pt: "Desliga a assistente Cortana.", en: "Turns off the Cortana assistant." } },
  { id: "disable_activity_feed", risk: "safe", group: "privacy", presets: ["privacy"], keywords: "historico timeline history",
    name: { pt: "Desativar histórico de atividades", en: "Disable activity history" },
    description: { pt: "A Linha do tempo deixa de registrar o que você abre.", en: "Timeline stops recording what you open." } },
  { id: "remove_bing_search", risk: "safe", group: "privacy", presets: ["essential", "privacy"], keywords: "pesquisa menu iniciar start web",
    name: { pt: "Tirar o Bing da busca do Iniciar", en: "Remove Bing from Start search" },
    description: { pt: "A busca do Iniciar procura só neste PC.", en: "Start search looks only on this PC." } },
  { id: "disable_location", risk: "moderate", riskNote: { pt: "Mapas, Clima e Localizar meu dispositivo param de saber onde você está.", en: "Maps, Weather and Find my device stop knowing where you are." }, group: "privacy", presets: ["privacy"], keywords: "gps localizacao",
    name: { pt: "Desativar localização", en: "Disable location" },
    description: { pt: "Nenhum app consegue ler sua localização.", en: "No app can read your location." } },
  { id: "disable_advertising_id", risk: "safe", group: "privacy", presets: ["essential", "privacy"], keywords: "anuncios ads rastreamento tracking",
    name: { pt: "Desativar ID de publicidade", en: "Disable advertising ID" },
    description: { pt: "Apps deixam de compartilhar um ID para anúncios.", en: "Apps stop sharing an ad tracking ID." } },
  { id: "disable_wifi_sense", risk: "safe", group: "privacy", keywords: "wifi rede network",
    name: { pt: "Desativar Wi-Fi Sense", en: "Disable Wi-Fi Sense" },
    description: { pt: "Não conecta sozinho em redes compartilhadas.", en: "Stops auto-connecting to shared networks." } },
  { id: "disable_feedback", risk: "safe", group: "privacy", presets: ["privacy"], keywords: "notificacoes notifications",
    name: { pt: "Desativar pedidos de feedback", en: "Disable feedback prompts" },
    description: { pt: "O Windows para de pedir sua opinião.", en: "Windows stops asking for feedback." } },

  { id: "high_performance_plan", risk: "moderate", riskNote: { pt: "Gasta mais energia; em notebook a bateria dura menos.", en: "Uses more power; on a laptop the battery lasts less." }, group: "performance", presets: ["essential", "gaming"], keywords: "energia power cpu jogo game fps",
    name: { pt: "Plano de energia de alto desempenho", en: "High performance power plan" },
    description: { pt: "Mantém o clock da CPU alto durante o jogo.", en: "Keeps CPU clocks high while gaming." } },
  { id: "optimize_hpet", risk: "moderate", riskNote: { pt: "Mexe na configuração de inicialização do Windows. Se notar travadas em jogos, desligue.", en: "Changes the Windows boot configuration. If you notice stutter in games, turn it off." }, group: "performance", presets: ["gaming"], keywords: "timer latencia latency jogo game",
    name: { pt: "Não forçar o HPET", en: "Stop forcing HPET" },
    description: { pt: "Volta o timer do sistema ao padrão do Windows.", en: "Returns the system timer to the Windows default." } },
  { id: "disable_game_bar", risk: "moderate", riskNote: { pt: "Win+G e a gravação de jogos do Windows deixam de funcionar.", en: "Win+G and Windows game recording stop working." }, group: "performance", presets: ["gaming"], keywords: "xbox gravacao recording jogo game fps",
    name: { pt: "Desativar gravação da Game Bar", en: "Disable Game Bar capture" },
    description: { pt: "Para a gravação em segundo plano do Xbox Game Bar.", en: "Stops Xbox Game Bar background recording." } },
  { id: "disable_superfetch", risk: "moderate", riskNote: { pt: "Em HD comum os apps podem demorar mais para abrir. Em SSD quase não muda.", en: "On a hard drive apps may open slower. On an SSD it barely changes." }, group: "performance", presets: ["essential"], keywords: "sysmain superfetch servico service memoria",
    name: { pt: "Desativar SysMain", en: "Disable SysMain" },
    description: { pt: "Serviço que pré-carrega apps na memória (melhor em SSD).", en: "Service that preloads apps into memory (better on SSDs)." } },
  { id: "disable_search_indexing", risk: "moderate", riskNote: { pt: "A busca do Iniciar e do Outlook fica mais lenta e pode não achar arquivos.", en: "Start and Outlook search get slower and may miss files." }, group: "performance", keywords: "indexacao indexing wsearch disco",
    name: { pt: "Desativar indexação da busca", en: "Disable search indexing" },
    description: { pt: "Para a indexação do disco em segundo plano.", en: "Stops background drive indexing." } },
  { id: "disable_visual_fx", risk: "safe", group: "performance", presets: ["essential"], keywords: "animacoes animations efeitos",
    name: { pt: "Desativar efeitos visuais", en: "Disable visual effects" },
    description: { pt: "Tira animações para a interface responder mais rápido.", en: "Turns off animations for a snappier interface." } },
  { id: "set_dns_cloudflare", risk: "moderate", riskNote: { pt: "Em rede de empresa, escola ou com VPN, sites internos podem parar de abrir.", en: "On work, school or VPN networks, internal sites may stop loading." }, group: "performance", keywords: "dns cloudflare 1.1.1.1 internet rede ping",
    name: { pt: "DNS Cloudflare 1.1.1.1", en: "Cloudflare DNS 1.1.1.1" },
    description: { pt: "Troca o DNS das placas de rede ativas.", en: "Switches DNS on active network adapters." } },

  { id: "dark_mode", risk: "safe", group: "interface", presets: ["essential"], keywords: "escuro tema theme",
    name: { pt: "Modo escuro", en: "Dark mode" },
    description: { pt: "Deixa o Windows e os apps no tema escuro.", en: "Puts Windows and apps in dark theme." } },
  { id: "classic_context_menu", risk: "safe", group: "interface", presets: ["essential"], keywords: "menu contexto botao direito right click windows 11",
    name: { pt: "Menu de contexto clássico", en: "Classic context menu" },
    description: { pt: "Volta o menu do botão direito do Windows 10.", en: "Brings back the Windows 10 right-click menu." } },
  { id: "show_file_extensions", risk: "safe", group: "interface", presets: ["essential"], keywords: "explorer arquivos files",
    name: { pt: "Mostrar extensões de arquivo", en: "Show file extensions" },
    description: { pt: "O Explorer mostra .exe, .txt e as outras.", en: "Explorer shows .exe, .txt and the rest." } },
  { id: "show_hidden_files", risk: "safe", group: "interface", keywords: "ocultos explorer",
    name: { pt: "Mostrar arquivos ocultos", en: "Show hidden files" },
    description: { pt: "O Explorer mostra arquivos ocultos.", en: "Explorer shows hidden files." } },
  { id: "disable_mouse_accel", risk: "safe", group: "interface", presets: ["gaming"], keywords: "mouse mira aim precisao jogo game",
    name: { pt: "Desativar aceleração do mouse", en: "Disable mouse acceleration" },
    description: { pt: "O cursor anda igual em qualquer velocidade.", en: "The cursor moves the same at any speed." } },

  { id: "enable_long_paths", risk: "safe", group: "system", presets: ["essential"], keywords: "caminhos paths 260",
    name: { pt: "Permitir caminhos longos", en: "Enable long paths" },
    description: { pt: "Tira o limite de 260 caracteres nos caminhos.", en: "Removes the 260-character path limit." } },
  { id: "enable_f8_boot", risk: "moderate", riskNote: { pt: "O PC mostra o menu de inicialização e espera alguns segundos a cada boot.", en: "The PC shows the boot menu and waits a few seconds on every start." }, group: "system", keywords: "boot recuperacao recovery",
    name: { pt: "Menu de boot no F8", en: "F8 boot menu" },
    description: { pt: "Mostra as opções de inicialização no boot.", en: "Shows boot options at startup." } },
  { id: "disable_fast_startup", risk: "safe", group: "system", keywords: "inicializacao rapida boot desligar shutdown",
    name: { pt: "Desativar inicialização rápida", en: "Disable fast startup" },
    description: { pt: "Desligar passa a ser um desligamento completo.", en: "Shutting down becomes a full shutdown." } },
  { id: "disable_windows_update", risk: "risky", riskNote: { pt: "O Windows para de receber correções de segurança. Deixe ligado só por pouco tempo.", en: "Windows stops getting security fixes. Keep it on only for a short time." }, group: "system", keywords: "atualizacoes updates windows update pausar",
    name: { pt: "Pausar atualizações automáticas", en: "Pause automatic updates" },
    description: { pt: "Desliga as atualizações automáticas; as manuais continuam.", en: "Turns off automatic updates; manual ones still work." } },
];

export const PRESETS: { key: PresetKey; name: Text; keywords: string }[] = [
  { key: "gaming", name: { pt: "Modo jogo", en: "Gaming mode" }, keywords: "jogo jogos game gaming fps desempenho performance" },
  { key: "privacy", name: { pt: "Privacidade máxima", en: "Maximum privacy" }, keywords: "privacidade privacy telemetria rastreamento" },
  { key: "essential", name: { pt: "Essencial", en: "Essentials" }, keywords: "essencial essential recomendado recommended basico" },
];

export function tweaksInPreset(key: PresetKey): TweakDef[] {
  return TWEAKS.filter((t) => t.presets?.includes(key));
}
