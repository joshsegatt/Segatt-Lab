---
name: Segatt Tools
description: Command-first Windows tuner on calm graphite, one jade accent for live state and the primary action.
colors:
  jade: "#3ddc97"
  jade-ink: "#05140d"
  jade-soft: "rgba(61, 220, 151, 0.14)"
  amber-pending: "#f5b84b"
  amber-soft: "rgba(245, 184, 75, 0.14)"
  red-failed: "#ff6b6b"
  red-soft: "rgba(255, 107, 107, 0.14)"
  graphite-side: "#131313"
  graphite-canvas: "#1a1a1a"
  graphite-raise: "#242424"
  graphite-raise-2: "#2c2c2c"
  hover-wash: "rgba(255, 255, 255, 0.045)"
  hairline: "rgba(255, 255, 255, 0.07)"
  hairline-strong: "rgba(255, 255, 255, 0.12)"
  ink: "#ededed"
  ink-2: "#a1a1a1"
  ink-3: "#737373"
typography:
  display:
    fontFamily: "Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  value:
    fontFamily: "Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  input:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  secondary:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0em"
  mono:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  key: "5px"
  tag: "6px"
  s: "10px"
  m: "14px"
  l: "20px"
  xl: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.jade}"
    textColor: "{colors.jade-ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.graphite-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.graphite-raise-2}"
  button-sm:
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  icon-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    size: "32px"
  composer:
    backgroundColor: "{colors.graphite-raise}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.xl}"
    padding: "16px 14px 12px 20px"
    width: "760px"
  results-panel:
    backgroundColor: "{colors.graphite-raise}"
    rounded: "{rounded.l}"
    padding: "8px"
  result-row:
    rounded: "{rounded.s}"
    padding: "9px 12px"
  result-row-selected:
    backgroundColor: "{colors.graphite-raise-2}"
  suggestion-pill:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "38px"
  status-pill:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  tag-on:
    backgroundColor: "{colors.jade-soft}"
    textColor: "{colors.jade}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  tag-pending:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-pending}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  tag-failed:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red-failed}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  tag-off:
    backgroundColor: "rgba(255, 255, 255, 0.06)"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  switch:
    backgroundColor: "#3a3a3a"
    rounded: "11px"
    width: "40px"
    height: "22px"
  switch-on:
    backgroundColor: "{colors.jade}"
  segmented:
    backgroundColor: "{colors.graphite-raise}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segment:
    textColor: "{colors.ink-2}"
    typography: "{typography.secondary}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "30px"
  segment-on:
    backgroundColor: "{colors.ink}"
    textColor: "#111111"
  search-field:
    backgroundColor: "{colors.graphite-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
    width: "220px"
  tweak-list:
    backgroundColor: "{colors.graphite-raise}"
    rounded: "{rounded.l}"
  tweak-row-hover:
    backgroundColor: "{colors.hover-wash}"
  tweak-row-pending:
    backgroundColor: "rgba(245, 184, 75, 0.035)"
  app-row:
    padding: "12px 18px"
  app-row-selected:
    backgroundColor: "rgba(245, 184, 75, 0.035)"
  version-update:
    textColor: "{colors.jade}"
    typography: "{typography.mono}"
  tweak-detail:
    rounded: "{rounded.m}"
    padding: "12px 14px"
  raw-error:
    backgroundColor: "{colors.graphite-canvas}"
    textColor: "{colors.ink-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.s}"
    padding: "10px 12px"
  pending-dock:
    backgroundColor: "{colors.graphite-raise-2}"
    textColor: "{colors.ink}"
    rounded: "24px"
    padding: "10px 10px 10px 20px"
    width: "860px"
  nav-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.s}"
    padding: "0 10px"
    height: "38px"
  nav-item-active:
    backgroundColor: "{colors.graphite-raise}"
    textColor: "{colors.ink}"
  sidebar:
    backgroundColor: "{colors.graphite-side}"
    width: "264px"
    padding: "14px 10px"
  toast:
    backgroundColor: "{colors.graphite-raise-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "12px 16px"
---

# Design System: Segatt Tools

## Overview

**Creative North Star: "The Calm Command Line"**

Segatt Tools reads like a modern AI desktop app (Copilot, the ChatGPT app, Antigravity), not like a gamer utility or a Windows settings page. The world is a quiet graphite room with one question and one composer at its centre: every action is found by typing, and every screen reports the PC's real state. Density is moderate and desktop-only: a 264px sidebar, a translucent 56px top bar, and a centred working column. Surfaces step up in flat greys and are separated by soft 1px light hairlines; depth comes from tone first and from two soft, diffuse shadows reserved for things that float.

Colour is almost absent on purpose. A single jade accent marks what is live, on, or the one primary action; amber means pending, red means failed. Everything else is ink on graphite. Type is the Windows system face (Segoe UI Variable, Display for titles and Text for UI) and Cascadia Mono only where the user reads something literal: a key, a command, a value. The app must work offline, so there are no web fonts.

The system refuses the gamer-tool default of black, neon and glowing edges, and the settings-page default of a wall of toggles. This build is **dark only**. A light theme is planned and not built; no light tokens exist and none should be invented until it ships.

**Key Characteristics:**
- Graphite tonal ladder (side, canvas, raise, raise-2) with 1px light hairlines instead of heavy borders.
- One jade accent, rationed to live state and the primary action.
- Large, soft radii: 28px composer, 20px groups, full pills for buttons, chips and status.
- System type only: Segoe UI Variable Display/Text, Cascadia Mono for literals.
- Soft diffuse shadows only on floating layers; one faint jade-amber glow behind the Home composer.
- Motion is short and decelerating (`cubic-bezier(0.16, 1, 0.3, 1)`), and fully disabled under reduced motion.

## Colors

Neutral graphite with ink in three strengths, plus three meaning colours that each carry exactly one message.

### Primary
- **Jade** (`jade`): live and active state (admin-on dot, "on" tags, selected checkboxes, completed cards), the primary button, the lead search result's icon tile, the caret in the composer, and the focus ring. Its 14% wash (`jade-soft`) backs "on" tags and preset icons. Text on a jade fill is always **Jade Ink** (`jade-ink`), never white.

### Secondary
- **Amber Pending** (`amber-pending`): something waiting or not yet in the desired state (not-admin status dot, pending tags, the info toast). Wash: `amber-soft`.

### Tertiary
- **Red Failed** (`red-failed`): a failure, shown as a failure (failed history entries, error toasts, "bad" tags, the admin warning banner). Wash: `red-soft`.

### Neutral
- **Sidebar Graphite** (`graphite-side`): the sidebar, the darkest plane.
- **Canvas Graphite** (`graphite-canvas`): the main canvas and the base of the translucent top bar.
- **Raised Graphite** (`graphite-raise`): composer, results panel, grouped lists, secondary buttons, the active nav item.
- **Raised Graphite 2** (`graphite-raise-2`): one step above raise: selected result row, hover on raised cards, toasts, tooltips, meter tracks.
- **Hover Wash** (`hover-wash`): the hover fill for transparent rows, nav items, icon buttons and ghost buttons.
- **Hairline** (`hairline`) and **Strong Hairline** (`hairline-strong`): dividers and resting borders; the strong one on buttons, pills, the composer and anything that floats.
- **Ink** (`ink`), **Ink 2** (`ink-2`), **Ink 3** (`ink-3`): primary text; secondary text, icons and inactive nav; tertiary text, group labels, placeholders and metadata.

### Named Rules
**The One Voice Rule.** Jade means "live, on, or do this". It never decorates: no jade headings, jade borders on idle cards, or jade icons without a state behind them. Suggestion-pill and preset icons are the single sanctioned decorative use, as small 16px glyphs.

**The Honest Colour Rule.** Amber and red are reserved for pending and failed. A failure is never rendered in jade or neutral to soften it.

## Typography

**Display Font:** Segoe UI Variable Display (with Segoe UI, system-ui)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui)
**Label/Mono Font:** Cascadia Mono (with Cascadia Code, Consolas)

**Character:** The native Windows 11 voice, set tight and calm: semibold titles with slight negative tracking, regular text at 14px. Mono appears only for things the user could type or read back literally.

### Hierarchy
- **Display** (600, 34px, 1.15, -0.02em): the one Home question above the composer. Balanced wrap, centred.
- **Headline** (600, 30px, 1.2, -0.02em): the page header on every working screen, with an optional 60ch description in Ink 2 below.
- **Value** (600, 18px, tabular numbers): live readings in the state strip; units beside it in Ink 3 at 13px.
- **Title** (600, 15px, -0.01em): product name in the sidebar, top-bar screen name (in Ink 2), group/list titles.
- **Secondary** (400, 13px, 1.45): the working secondary step. Row descriptions on Tweaks (in Ink 2), group counts (Ink 3, tabular), the inline failure line, dock notes, segmented-control labels (500), small buttons, the status pill, toasts and card descriptions. 12.5px is the step below it, kept for result sublines and the Tweaks detail panel's mono values and meta line.
- **Body** (400, 14px, 1.45): default UI text. Result titles use 600 weight at body size; the Home lede sits at 15.5px in Ink 2.
- **Input** (400, 16px): the composer field.
- **Label** (600, 12px, no tracking, sentence case): group labels in results and sidebar history, state-strip terms (500 weight there), tags. Ink 3 except on tags.
- **Mono** (400, 12px): keyboard keys, literal commands or values, and the raw error block. The Tweaks detail panel sets its command path and before/after values at 12.5px, and app version changes on Apps use the same 12.5px before/after line.

### Named Rules
**The System Face Rule.** Only installed Windows faces. No web fonts, ever: the app runs offline.

**The Literal Mono Rule.** Cascadia Mono is for keys, commands, registry paths and values. Never for headings, labels or decoration.

## Layout

A fixed desktop shell: a 264px sidebar column and a fluid main column (CSS grid). The main column scrolls; inside it a sticky 56px top bar (screen name left, status pill and icon buttons right, 20px side padding) sits over content padded 0 32px 40px. Home centres one 760px column vertically: question, lede, composer, suggestions (8px gaps, up to 780px), then a four-cell state strip 56px below. When search results open, the column jumps to the top (6vh) and the lede hides so the list fits the window; only the results scroll, the key hints stay in view.

Tweaks uses a wider 860px centred column (8px top, 140px bottom padding so the last row clears the floating dock): page title in Headline with a lede in Ink 2, a tools row (segmented presets, a 220px search pushed right, one icon button), then the grouped lists 22px apart.

Apps shares that 860px column, header, tools row and grouped-list styles with Tweaks (one stylesheet for both screens). Its segmented control switches views instead of presets, the tools row ends with a refresh icon button, and the Catálogo view groups apps by category with an "N de M instalados" count. App rows run on a four-track grid: a 20px checkbox track, the flexible name block, an auto-width tag slot, and a fixed 176px actions track (14px gaps, 12px 18px inset). Rows without a checkbox drop the first track. Because the actions track is fixed and the tag slot is always rendered (empty when there is no state), tags and buttons stay aligned down the whole list whatever a row is doing.

Spacing runs on a 4px base with 8, 12, 16, 20, 24 and 32px doing almost all the work; 56px separates the Home composer cluster from the live-state strip. Product target is desktop windows only; the single breakpoint (900px) folds the state strip from four cells to two.

## Elevation & Depth

Tonal first. Planes step from sidebar to canvas to raise to raise-2, separated by hairlines; resting surfaces carry no shadow. Shadows are soft, large, offset downward, and appear only on layers that float above the page: the composer, the results panel, toasts and tooltips. The top bar is a translucent canvas (88%) with a 12px blur, so content passes beneath it without a hard rule.

### Shadow Vocabulary
- **Raise** (`box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35)`): the composer at rest, combined with a 1px inner top highlight at 4% white.
- **Float** (`box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45)`): the results panel, toasts, tooltips.
- **Status halo** (`box-shadow: 0 0 0 3px` at 18% of the state colour): a solid ring around live/pending status dots only.
- **Knob** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4)`): the switch knob only, so the light disc reads on its track. It belongs to the control, not to elevation.

The floating dock on Tweaks and Apps uses Float, like the results panel and toasts.

### Named Rules
**The Flat-At-Rest Rule.** Lists, cards, pills and nav sit flat. Only something that floats over other content gets a shadow.

**The One Glow Rule.** The single atmospheric glow is the faint, blurred jade-and-amber radial behind the Home composer (15% and 9% alpha). No other surface glows.

## Shapes

Generously rounded and soft, never sharp. Radii scale with the size of the object: 28px for the composer, 20px for grouped containers, results panel and the state strip, 14px for cards, toasts and the lead result, 10px for rows, nav items and small tiles. Every button, chip, suggestion and status indicator is a full pill (999px); icon buttons and status dots are circles. Small inline objects use tight corners: 6px tags, 5px keyboard keys. The switch track (40x22) is a full pill; its 11px corner is simply half its height. The pending-changes dock is the one 24px corner: a single floating bar, not a scale step. Borders are always 1px hairlines; there are no thick outlines. The focus ring is a 2px jade outline offset 2px.

## Components

### Buttons
Quiet pills; only the primary one has colour.
- **Shape:** full pill, 36px tall (32px small), 1px strong hairline border.
- **Primary:** jade fill, jade-ink text, 600 13.5px, no border; hover lightens to a brighter jade.
- **Secondary:** raised graphite fill, ink text; hover steps to raise-2.
- **Ghost / default:** transparent with or without hairline; hover takes the hover wash.
- **Press / Disabled:** press scales to 0.98 on the decelerating curve; disabled drops to 45% opacity.
- **Icon button:** 32px circle, Ink 2 glyph, hover wash with Ink. Send in the composer is a 36px circle in ink with dark glyph, scaling 1.05 on hover, 25% opacity when empty.

### Chips
- **Suggestion pill:** 38px pill, 3% white fill, hairline border, Ink 2 text with a 16px jade glyph and the label in Ink 600, optional real count after it. Hover: hover wash and strong hairline. The Home "Atualizar" pill opens Apps on the Atualizações view and carries the real update count ("16 apps") or "em dia"; before the apps are read it carries nothing.
- **Status pill:** 32px outlined pill in the top bar with a 7px status dot (jade live, amber warn, Ink 3 unknown).
- **Tag:** 22px, 6px corners, 12px 600; on / pending / failed use the soft wash of their colour with the solid colour as text; off is a 6% white wash with Ink 2 text.
- **Tweak state tags:** every tweak row (on Tweaks and in the Home results) carries its real state: "Ativo" (on), "Padrão do Windows" and "Desconhecido" (off; the unknown one carries the engine's reason as its tooltip), "Vai ativar" / "Vai desfazer" and "Aplicando…" with a 12px spinner (pending), "Falhou" (failed, while the change is still pending). No state read yet means no tag.

### Switch
- **Track:** 40x22 full pill, #3a3a3a when off, jade when on; no border.
- **Knob:** 18px circle inset 2px, #d4d4d4 off and white on, with the Knob shadow; slides 18px. Track and knob change over 0.2s on the decelerating curve.
- **Disabled:** 50% opacity while states are unread or a change is running.
- Switches only appear as the trailing control of a list row that also shows a state tag and opens a detail panel; never on their own.

### Segmented control
- **Shape:** a raised-graphite pill with a hairline border and 3px inset; segments are 30px pills, 13px 500 in Ink 2, Ink on hover.
- **Selected:** solid Ink fill with near-black text at 600, the same neutral inversion as the composer's send button. Not jade: choosing a preset or a view is not a live state.
- **Counts:** a segment may carry a real count after its label (12px, tabular numbers, inherited colour at 70% opacity, 6px left gap): Apps shows "Instalados 84" and "Atualizações 16". A count appears only once the number is read, and the updates count only when it is above zero.
- **Passive segment:** "Personalizado" is not clickable (out of the tab order, default cursor, not dimmed). It takes the selected fill by itself when tweaks are picked by hand.
- **Disabled:** 60% opacity while states load or a change runs.

### Search field
36px raised-graphite pill, 220px, hairline border that strengthens on focus, 15px Ink 3 search glyph, 13.5px input.

### Cards / Containers
- **Corner Style:** 20px for groups and panels, 14px for single cards.
- **Background:** raised graphite; hover on interactive cards steps to raise-2 and strengthens the hairline.
- **Shadow Strategy:** none at rest (Flat-At-Rest Rule).
- **Border:** 1px hairline.
- **Internal Padding:** 14-20px; list rows 12px 18px with hairline dividers.
- **State strip:** four cells in one 20px-rounded outline at 2% white, cells divided by hairlines, each with a 3px Ink 2 meter on a raise-2 track. The active-tweaks cell's meter is jade, because it measures live state.

### Inputs / Fields
- **Composer:** the signature input. 760px wide, raised graphite, 28px corners, strong hairline, Raise shadow plus inner highlight; borderless 16px field with jade caret and Ink 3 placeholder; a footer row with a plain-information note (jade shield glyph, Ink 3 text) and the round send button.
- **Focus:** the composer border brightens to 20% white; elsewhere the global 2px jade focus ring.

### Navigation
- **Sidebar:** sidebar graphite with a hairline on its right edge. Brand row (28px jade monogram tile, product name in Title), seven 38px nav items (18px line icon at 1.75 stroke, Ink 2, 500 weight); hover takes the hover wash, the active item takes raised graphite and Ink. Nav items may carry a live count at the right edge (12px Ink 3, tabular numbers); Tweaks shows active of total ("9/24"), Apps shows the number of app updates available (only when above zero, with "Atualizações" as its tooltip), and an item with no real number shows nothing. Below, the activity history grouped by day under 12px Ink 3 labels, entries in 13.5px Ink 2 clamped to two lines, failed entries in red with the detail in Ink 3. The PC chip (30px circle icon, host name, OS version in Ink 3) closes the column.
- **Top bar:** translucent, screen name in Title at Ink 2, actions right with 8px gaps.

### Command Results (signature)
The floating panel under the composer: raised graphite, 20px corners, Float shadow, 8px inset, opening with a 0.22s fade-and-rise. The lead result (the matching preset) is a 14px-rounded row with a faint jade wash and jade hairline, a solid jade icon tile and an Enter key at the right. Other results are 10px-rounded rows grouped under sentence-case 12px labels, each with a 30px neutral icon tile, a 600-weight title and a 12.5px Ink 3 subline. Selection is raise-2. Tweak results carry their state tag at the right edge. A hairline-topped footer lists the keys (arrows, Enter, Esc) in mono key caps.

### Tweak List (signature)
The Tweaks screen's grouped list. Each group has a Title-size heading with its "N de M ativos" count in Secondary Ink 3, then one raised-graphite container with 20px corners, a hairline border and hairline dividers between rows.
- **Row:** name (600) over a Secondary description in Ink 2 on the left, the state tag, then the switch in a 44px column. The whole row takes the hover wash; the name block is the button that expands the row.
- **Pending:** a row whose switch differs from the PC's real state takes a faint amber tint (3.5%) until applied or discarded.
- **Arrival:** a row opened from a Home search scrolls to centre and flashes jade-soft, fading out over 1.6s.
- **Detail panel:** opens under the row with a 0.2s fade-and-rise (4px). 14px corners, hairline outline, 12px 14px inset. One line per change: the exact command or registry path in mono Ink 2 on the left; on the right the old value struck through in Ink 3, an arrow, and the new value in jade 600. When the value did not exist, the old side reads "não definido" in Ink 3, unstruck. A meta line in 12.5px Ink 3 says whether a restart is needed and how to undo ("Para desfazer, desligue: volta a …").
- **Failure line:** under the row, in red at 13px with a 14px warning glyph: the time and a translated reason ("Falhou às 00:46: acesso negado…"), then two underlined Ink text buttons, "Ver detalhes" and "Tentar de novo" (with a 13px retry glyph). "Ver detalhes" opens the raw engine message as a mono block on canvas graphite with 10px corners.

### Your PC (spec sheet)

On Home, under the live numbers: a 15px "Seu PC" heading with an Ink 3 note ("Lido do Windows agora. Nada sai deste computador.", or the reading/failed state with a plain "Tentar de novo" text button). Below, one 760px hairline container, two columns of label (12px Ink 3) over value (14px semibold Ink) and detail (12.5px Ink 3), ellipsis with the full text in a tooltip; one column under 640px. Eight cells: Processador, Placa de vídeo, Memória, Placa-mãe, Disco do Windows, Tela, Windows, Tipo. Values use the box's words: binary GB for RAM/VRAM, decimal TB for drives, vendor short names (MSI, ASUS).

Hardware-aware tweaks: when a rule in `src/lib/hardware.ts` says a tweak does not fit this PC, its access line adds "Fora do perfil neste PC" (Ink 2, CPU glyph), the detail panel says why, and presets leave it out.

### Control list

The Control screen reuses the app row (info | tag slot | 176px actions, no checkbox) with descriptions that wrap (`appInfoWrap`) because they must be read in full. Windows Update modes are rows, not cards: the current one carries the jade "Atual" tag and no button; the others offer "Usar". Risky modes confirm inline and always make a restore point first. Moderate and risky notes sit under the row in Ink 2 or red. Windows features show their real state (Ativo, Desligado, Indisponível nesta edição), one change at a time with "Mudando…" and a plain note that it can take minutes; a pending restart is said once above the list. Failures give a plain reason first and the raw Windows message under "Ver detalhes".

### Cleaner list

One list in the app-row shape without an action track: checkbox, name over a wrapping description, the risk line (word plus the one-sentence note inline), and the measured size at the right in 13px semibold tabular Ink (Ink 3 at 0 KB, a dash for the DNS flush, which frees no files). Above the list, "Dá para liberar" with the total in a 20px Display figure, plus "Medir de novo" and System Restore icon buttons. Safe items that free something start checked; moderate ones start unchecked; risky ones (Recycle Bin, Windows.old) confirm inline before they can be checked and force the restore point. The Pending-Changes Dock reads "{n} itens · {tamanho}" and "Limpar N"; during a run it is one live line ("Limpando i de n · item"). Each finished row shows "Liberou {tamanho}" as a jade tag, measured before and after, so files in use are never counted; failures use the shared failure line. Sizes use Explorer's units (binary, "GB").

### Onboarding

First run only, until a level is stored. A full-window takeover on canvas graphite (no card, no backdrop blur), one 560px column anchored at 14vh so the buttons never move between steps, content fading in with a 6px rise per step. Three steps: what the app does, why it is safe, and the knowledge level. Steps 1–2 are a heading, a 15px Ink 2 lede and one hairline list of three rows (30px neutral icon tile, 600 title, 13px Ink 2 line); step 1 opens with the 44px jade monogram. Step 3 is a radio list of the three levels (name, who it is for in Ink 2, what it shows in Ink 3); the picked row takes the jade-soft wash. Footer: ghost "Pular" (starts as Iniciante; not on the level step) left, step dots centred (the current one a 18px jade bar), "Voltar" and the primary "Continuar" / "Começar" right. The app behind is inert while it is up.

### Knowledge level

Three levels gate what is listed, never how a change is protected:
- **Tweaks, presets and the Home search** follow the risk scale: Iniciante sees Seguro, Intermediário adds Moderado, Avançado sees everything. Presets stay whole at every level (they never hold a risky tweak); their moderate rows show while pending, with the risk line. The sidebar count is out of what the level lists.
- **Cleaner, Fixes and Control** hide only Arriscado items below Avançado.
- Anything already on, pending or current stays listed at every level, so it can be undone.
- Iniciante sees no registry paths in a tweak's detail; Avançado sees raw error output without "Ver detalhes".

The level lives in a top-bar pill (graduation glyph, level name, chevron) left of the admin pill; it opens a raised menu of the three levels with their one-line description and a jade check on the current one. Under the Tweaks list, a 13px Ink 3 line counts what is hidden, with an underlined "Mostrar tudo" that opens the inline confirm before switching to Avançado. An imported profile lists above-level tweaks without a checkbox and with "Precisa do nível …" in the access line.

### Profile

The Profile screen reuses the app row in two one-row lists: "Exportar" (this PC's count of tweaks on and winget apps, a secondary "Exportar"; once saved, the jade "Salvo" tag and the path in Ink 2 with a ghost "Mostrar na pasta") and "Importar" (the file name and export date, a secondary "Escolher arquivo" that becomes a ghost "Outro arquivo"). A bad file gives one red line saying why, never a dialog. An imported profile opens two checkbox lists, "Ajustes do perfil" and "Apps do perfil", each with "{n} já ... aqui" beside its heading and only what would change on this PC. Tweak rows keep the Access & Risk line; risky tweaks and tweaks that do not fit this hardware start unchecked (checking a risky one opens the inline risky confirm). Rows have no action track (`appLineNoActions`): state lives in the tag slot. The Pending-Changes Dock applies the selection: tweaks first (restore point, forced with a risky tweak), then the apps join the shared install queue.

### Access & Risk line

Every tweak row carries a third line in 12px Ink 3 under its description, plain text with a hairline (Line 2) between the two parts, no chips:

- **Scope**, read from what the tweak actually changes (never hand-written): "Sua conta" (HKCU only), "PC todo" (HKLM, services, power, network: needs administrator) or "Inicialização do Windows" (bcdedit). Its hint repeats in the detail meta line.
- **Risk**: "Seguro" in Ink 3; "Moderado" in Ink 2 with a 12px warning glyph; "Arriscado" in red with the same glyph. Moderate and risky items carry a one-sentence note of what the user may notice or lose, shown in the detail panel (and on Cleaner/Fixes cards via `RiskLine`).
- **Risky confirm**: turning a risky tweak on, or running a risky cleanup, opens an inline confirm under the row (red glyph, the consequence, the action and "Cancelar"). A pending risky change forces the dock's restore-point checkbox on and disabled, with "obrigatório com ajuste arriscado" in Ink 3. Presets and "Limpar tudo" never include a risky item.

### App List (signature)
The Apps screen's rows, used for the catalog, the installed list, the updates list and winget search results alike. Same container as the Tweak List: raised graphite, 20px corners, hairline outline and dividers, hover wash on the row.
- **Row:** checkbox, name (600) over a single-line Secondary subline in Ink 2 (description, or package id and version) that truncates with an ellipsis, the tag slot, then the actions track. Actions are small pills: "Atualizar" and "Instalar" secondary, "Remover" ghost. A row that is queued or running shows no actions.
- **Checkbox:** 16px native checkbox with a jade accent, only on catalog rows that are not installed and not busy. A catalog row that cannot be picked keeps an empty placeholder in the checkbox track so its columns stay aligned; lists with no selection (installed, updates, winget) drop the track. A selected row takes the same faint amber tint (3.5%) as a pending tweak.
- **Update available:** the tag slot shows the change the way a tweak detail does: the installed version struck through in Ink 3, an Ink 3 arrow, and the new version in jade 600, all in 12.5px mono. This is the single update idiom on every Apps list.
- **State tags:** "Instalado {versão}" (on) for a present app; "Na fila" (off) while queued; "Instalando…", "Atualizando…" or "Removendo…" (pending, with a 12px spinner) while running; "Instalado", "Atualizado" or "Removido" (on) when done; "Falhou" (failed). A row whose job finishes flashes jade-soft and fades over 1.6s, the same flash as a tweak's arrival.
- **Remove confirm:** removing never opens a modal. "Remover" opens a line under the row, 13px in Ink with a 14px amber warning glyph: "Remover {nome} deste PC? O app não consegue desfazer isso." followed by a small secondary "Remover" and a small ghost "Cancelar". The row's own "Remover" hides while the line is open.
- **Failure line:** the Tweaks failure line, reused: red 13px with the warning glyph, the time and the translated winget reason (with an admin hint appended when the app is not running as administrator and the cause may be permissions), then "Ver detalhes" (the raw winget output in the canvas-graphite mono block) and "Tentar de novo".
- **Update all:** the Atualizações view puts a small primary "Atualizar tudo {n}" above its list; it is disabled while any run is active.

### Pending-Changes Dock
Floats 24px above the bottom, centred on the main column and as wide as the 860px working column (minus 64px on narrow windows). Raised graphite 2, strong hairline, 24px corners, Float shadow, entering with a 0.25s fade-and-rise. Left: the change count in 600, a "Ponto de restauração antes" checkbox (jade accent, jade shield glyph, Secondary Ink 2; shown only when something will be turned on), restart and progress notes in Secondary Ink 2, and the not-admin warning in Secondary amber. Right: a default "Descartar" button and the primary "Aplicar N" button.

Apps uses the same dock as a progress and selection bar. It opens while a run is active or while catalog apps are selected. During a run, the left side reads as one live line: a 14px spinner and "Instalando / Atualizando / Removendo i de n · App" in Secondary Ink 2, with no buttons. With a selection and no run, it shows "N apps selecionados" in 600, a default "Limpar seleção" button and the primary "Instalar N". When the app is not running as administrator, the amber warning ("Sem administrador: alguns instaladores vão falhar ou pedir permissão.") sits beside either state. The finished batch reports through the toast ("{ok} de {n} concluídos.").

### Toast
Bottom-right, raise-2, 14px corners, strong hairline, Float shadow; an 8px dot at left carries the meaning colour (jade success, red error, amber info). While the pending-changes dock is up, the toast is lifted to 96px from the bottom so it never covers the dock's buttons.

## Do's and Don'ts

### Do:
- **Do** keep jade for live state, the primary action and focus; use amber only for pending and red only for failed.
- **Do** separate surfaces by tone and 1px hairlines; give a shadow only to things that float (Raise for the composer, Float for panels, toasts, tooltips).
- **Do** make every button, chip and status indicator a full pill, and match container radius to size (28 / 20 / 14 / 10px).
- **Do** use Segoe UI Variable Display for titles and Text for UI, and Cascadia Mono only for keys, commands and values.
- **Do** show real numbers only; when a reading is not available yet, show nothing or a dash, never a placeholder figure.
- **Do** honour reduced motion: the global rule collapses every animation and transition.
- **Do** show any version or value change as old struck through in Ink 3, an arrow, and new in jade mono (12.5px), the same line on Tweaks details, on every Apps list and in the Home search.
- **Do** confirm a destructive row action inline under the row (amber warning glyph, plain consequence, the action and "Cancelar"), not in a modal.
- **Do** show every tweak's scope and risk in words on its row, and confirm risky actions inline with a forced restore point.
- **Do** keep list columns aligned while state changes: fixed action tracks and an always-present tag slot, so tags and buttons never jump.

### Don't:
- **Don't** use black, neon, or glowing edges; the only glow is the faint one behind the Home composer.
- **Don't** build screens as a wall of bare toggles; lead with the composer, grouped lists and visible state. A switch lives only at the end of a row that shows its state tag and opens its exact change.
- **Don't** load web fonts or icon fonts; icons are inline SVG line icons at 1.75 stroke.
- **Don't** invent light-theme values; the light theme is not built yet.
- **Don't** use the legacy variable names (`--bg-main`, `--bg-sidebar`, `--glass-bg`, `--glass-border`, `--bg-hover`, `--accent`, `--accent-dim`, `--border-accent`, `--accent-glow`, `--text-primary`, `--text-secondary`, `--text-muted`, `--success`, `--warning`, `--r-lg`, `--r-md`, `--r-sm`, `--font-display`, `--font-body`) in new code. They are aliases kept only so screens not yet rebuilt inherit the palette, and are removed once those screens are rebuilt. They are not part of this system.
