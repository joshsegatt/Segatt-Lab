// Debloat: apps Windows ships with that most people never open. Removal is per
// account and every one comes back from the Microsoft Store (OneDrive through
// winget). The ids must match APPX and WINGET in src-tauri/src/features/debloat.rs.

// Relative with extension so the Node test runner can load them too.
import type { Text } from "./i18n.ts";
import type { Risk } from "./tweaks-catalog.ts";

export interface BloatDef {
  id: string;
  risk: Risk;
  name: Text;
  description: Text;
  /** Required unless safe: what stops working. */
  note?: Text;
}

export const BLOAT: BloatDef[] = [
  { id: "Microsoft.Copilot", risk: "safe", name: { pt: "Copilot", en: "Copilot" }, description: { pt: "O app do assistente de IA da Microsoft.", en: "Microsoft's AI assistant app." } },
  { id: "Microsoft.BingNews", risk: "safe", name: { pt: "Notícias", en: "News" }, description: { pt: "Notícias do MSN.", en: "MSN news." } },
  { id: "Microsoft.BingWeather", risk: "safe", name: { pt: "Clima", en: "Weather" }, description: { pt: "Previsão do tempo do MSN.", en: "MSN weather forecast." } },
  { id: "Microsoft.BingSearch", risk: "safe", name: { pt: "Pesquisa do Bing", en: "Bing Search" }, description: { pt: "O app de busca na web do Bing.", en: "The Bing web search app." } },
  { id: "Microsoft.GetHelp", risk: "safe", name: { pt: "Obter Ajuda", en: "Get Help" }, description: { pt: "O chat de suporte da Microsoft.", en: "Microsoft's support chat." } },
  { id: "Microsoft.Getstarted", risk: "safe", name: { pt: "Dicas", en: "Tips" }, description: { pt: "Dicas de uso do Windows.", en: "Tips on using Windows." } },
  { id: "Microsoft.MicrosoftSolitaireCollection", risk: "safe", name: { pt: "Solitaire Collection", en: "Solitaire Collection" }, description: { pt: "Paciência e outros jogos de cartas, com anúncios.", en: "Solitaire and other card games, with ads." } },
  { id: "Microsoft.MicrosoftOfficeHub", risk: "safe", name: { pt: "Microsoft 365 (Office)", en: "Microsoft 365 (Office)" }, description: { pt: "O atalho que oferece a assinatura do Office. Não remove Word nem Excel.", en: "The shortcut that sells the Office subscription. Does not remove Word or Excel." } },
  { id: "Microsoft.OutlookForWindows", risk: "safe", name: { pt: "Outlook (novo)", en: "Outlook (new)" }, description: { pt: "O novo app de e-mail do Windows.", en: "The new Windows mail app." } },
  { id: "Microsoft.PowerAutomateDesktop", risk: "safe", name: { pt: "Power Automate", en: "Power Automate" }, description: { pt: "Automação de tarefas para empresas.", en: "Task automation for businesses." } },
  { id: "Microsoft.Todos", risk: "safe", name: { pt: "Microsoft To Do", en: "Microsoft To Do" }, description: { pt: "Lista de tarefas da Microsoft.", en: "Microsoft's to-do list." } },
  { id: "Microsoft.WindowsFeedbackHub", risk: "safe", name: { pt: "Hub de Comentários", en: "Feedback Hub" }, description: { pt: "Envia sugestões e problemas para a Microsoft.", en: "Sends suggestions and problems to Microsoft." } },
  { id: "Microsoft.WindowsMaps", risk: "safe", name: { pt: "Mapas", en: "Maps" }, description: { pt: "Os mapas do Windows.", en: "Windows Maps." } },
  { id: "Microsoft.ZuneVideo", risk: "safe", name: { pt: "Filmes e TV", en: "Movies & TV" }, description: { pt: "O antigo player de vídeos e loja de filmes.", en: "The old video player and movie store." } },
  { id: "MSTeams", risk: "safe", name: { pt: "Microsoft Teams (pessoal)", en: "Microsoft Teams (personal)" }, description: { pt: "O Teams que vem com o Windows. O Teams do trabalho é outro app.", en: "The Teams that ships with Windows. Work Teams is a separate app." } },
  { id: "Clipchamp.Clipchamp", risk: "safe", name: { pt: "Clipchamp", en: "Clipchamp" }, description: { pt: "Editor de vídeo da Microsoft.", en: "Microsoft's video editor." } },
  { id: "Microsoft.YourPhone", risk: "moderate", name: { pt: "Vincular ao Celular", en: "Phone Link" }, description: { pt: "Liga o celular ao PC.", en: "Links your phone to the PC." },
    note: { pt: "Mensagens e notificações do celular deixam de aparecer no PC.", en: "Phone messages and notifications stop showing on the PC." } },
  { id: "MicrosoftCorporationII.QuickAssist", risk: "moderate", name: { pt: "Assistência Rápida", en: "Quick Assist" }, description: { pt: "Ajuda remota do Windows.", en: "Windows remote help." },
    note: { pt: "Ninguém consegue te ajudar remotamente por ele até reinstalar.", en: "Nobody can help you remotely through it until you reinstall it." } },
  { id: "Microsoft.GamingApp", risk: "moderate", name: { pt: "Xbox", en: "Xbox" }, description: { pt: "O app do Xbox e do Game Pass no PC.", en: "The Xbox and Game Pass app on PC." },
    note: { pt: "Jogos do Game Pass no PC precisam dele para instalar e abrir.", en: "PC Game Pass games need it to install and launch." } },
  { id: "Microsoft.XboxGamingOverlay", risk: "moderate", name: { pt: "Xbox Game Bar", en: "Xbox Game Bar" }, description: { pt: "A barra de jogo do Win+G.", en: "The Win+G game bar." },
    note: { pt: "Win+G, gravação de jogos e alguns controles de jogos deixam de funcionar.", en: "Win+G, game recording and some game controllers stop working." } },
  { id: "MicrosoftWindows.Client.WebExperience", risk: "moderate", name: { pt: "Widgets", en: "Widgets" }, description: { pt: "O painel de notícias e clima da barra de tarefas.", en: "The news and weather panel on the taskbar." },
    note: { pt: "Alguns recursos novos do Windows dependem dele e podem sumir junto.", en: "Some newer Windows features depend on it and may go with it." } },
  { id: "OneDrive", risk: "moderate", name: { pt: "OneDrive", en: "OneDrive" }, description: { pt: "A nuvem da Microsoft que sincroniza Documentos, Imagens e Área de Trabalho.", en: "Microsoft's cloud that syncs Documents, Pictures and Desktop." },
    note: { pt: "Arquivos que estão só na nuvem deixam de aparecer no PC. Os que já estão no PC ficam.", en: "Files that are only in the cloud stop showing on the PC. Files already on the PC stay." } },
];

/** Starts picked: safe apps that are installed. Moderate ones wait for the person. */
export const startsPicked = (b: BloatDef, installed: boolean) => installed && b.risk === "safe";
