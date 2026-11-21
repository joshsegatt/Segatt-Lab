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
- **Body** (400, 14px, 1.45): default UI text. Result titles use 600 weight at body size; the Home lede sits at 15.5px in Ink 2.
- **Input** (400, 16px): the composer field.
- **Label** (600, 12px, no tracking, sentence case): group labels in results and sidebar history, state-strip terms (500 weight there), tags. Ink 3 except on tags.
- **Mono** (400, 12px): keyboard keys and literal commands or values.

### Named Rules
**The System Face Rule.** Only installed Windows faces. No web fonts, ever: the app runs offline.

**The Literal Mono Rule.** Cascadia Mono is for keys, commands, registry paths and values. Never for headings, labels or decoration.

## Layout

A fixed desktop shell: a 264px sidebar column and a fluid main column (CSS grid). The main column scrolls; inside it a sticky 56px top bar (screen name left, status pill and icon buttons right, 20px side padding) sits over content padded 0 32px 40px. Home centres one 760px column vertically: question, lede, composer, suggestions (8px gaps, up to 780px), then a four-cell state strip 56px below. When search results open, the column jumps to the top (6vh) and the lede hides so the list fits the window; only the results scroll, the key hints stay in view.

Spacing runs on a 4px base with 8, 12, 16, 20, 24 and 32px doing almost all the work; 56px separates the Home composer cluster from the live-state strip. Product target is desktop windows only; the single breakpoint (900px) folds the state strip from four cells to two.

## Elevation & Depth

Tonal first. Planes step from sidebar to canvas to raise to raise-2, separated by hairlines; resting surfaces carry no shadow. Shadows are soft, large, offset downward, and appear only on layers that float above the page: the composer, the results panel, toasts and tooltips. The top bar is a translucent canvas (88%) with a 12px blur, so content passes beneath it without a hard rule.

### Shadow Vocabulary
- **Raise** (`box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35)`): the composer at rest, combined with a 1px inner top highlight at 4% white.
- **Float** (`box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45)`): the results panel, toasts, tooltips.
- **Status halo** (`box-shadow: 0 0 0 3px` at 18% of the state colour): a solid ring around live/pending status dots only.

### Named Rules
**The Flat-At-Rest Rule.** Lists, cards, pills and nav sit flat. Only something that floats over other content gets a shadow.

**The One Glow Rule.** The single atmospheric glow is the faint, blurred jade-and-amber radial behind the Home composer (15% and 9% alpha). No other surface glows.

## Shapes

Generously rounded and soft, never sharp. Radii scale with the size of the object: 28px for the composer, 20px for grouped containers, results panel and the state strip, 14px for cards, toasts and the lead result, 10px for rows, nav items and small tiles. Every button, chip, suggestion and status indicator is a full pill (999px); icon buttons and status dots are circles. Small inline objects use tight corners: 6px tags, 5px keyboard keys. Borders are always 1px hairlines; there are no thick outlines. The focus ring is a 2px jade outline offset 2px.

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
- **Suggestion pill:** 38px pill, 3% white fill, hairline border, Ink 2 text with a 16px jade glyph and the label in Ink 600, optional real count after it. Hover: hover wash and strong hairline.
- **Status pill:** 32px outlined pill in the top bar with a 7px status dot (jade live, amber warn, Ink 3 unknown).
- **Tag:** 22px, 6px corners, 12px 600; on / off / pending / failed use the soft wash of their colour with the solid colour as text.

### Cards / Containers
- **Corner Style:** 20px for groups and panels, 14px for single cards.
- **Background:** raised graphite; hover on interactive cards steps to raise-2 and strengthens the hairline.
- **Shadow Strategy:** none at rest (Flat-At-Rest Rule).
- **Border:** 1px hairline.
- **Internal Padding:** 14-20px; list rows 12px 18px with hairline dividers.
- **State strip:** four cells in one 20px-rounded outline at 2% white, cells divided by hairlines, each with a 3px Ink 2 meter on a raise-2 track.

### Inputs / Fields
- **Composer:** the signature input. 760px wide, raised graphite, 28px corners, strong hairline, Raise shadow plus inner highlight; borderless 16px field with jade caret and Ink 3 placeholder; a footer row with a plain-information note (jade shield glyph, Ink 3 text) and the round send button.
- **Focus:** the composer border brightens to 20% white; elsewhere the global 2px jade focus ring.

### Navigation
- **Sidebar:** sidebar graphite with a hairline on its right edge. Brand row (28px jade monogram tile, product name in Title), six 38px nav items (18px line icon at 1.75 stroke, Ink 2, 500 weight); hover takes the hover wash, the active item takes raised graphite and Ink. Below, the activity history grouped by day under 12px Ink 3 labels, entries in 13.5px Ink 2, failed entries in red. The PC chip (30px circle icon, host name, OS version in Ink 3) closes the column.
- **Top bar:** translucent, screen name in Title at Ink 2, actions right with 8px gaps.

### Command Results (signature)
The floating panel under the composer: raised graphite, 20px corners, Float shadow, 8px inset, opening with a 0.22s fade-and-rise. The lead result (the matching preset) is a 14px-rounded row with a faint jade wash and jade hairline, a solid jade icon tile and an Enter key at the right. Other results are 10px-rounded rows grouped under sentence-case 12px labels, each with a 30px neutral icon tile, a 600-weight title and a 12.5px Ink 3 subline. Selection is raise-2. A hairline-topped footer lists the keys (arrows, Enter, Esc) in mono key caps.

### Toast
Bottom-right, raise-2, 14px corners, strong hairline, Float shadow; an 8px dot at left carries the meaning colour (jade success, red error, amber info).

## Do's and Don'ts

### Do:
- **Do** keep jade for live state, the primary action and focus; use amber only for pending and red only for failed.
- **Do** separate surfaces by tone and 1px hairlines; give a shadow only to things that float (Raise for the composer, Float for panels, toasts, tooltips).
- **Do** make every button, chip and status indicator a full pill, and match container radius to size (28 / 20 / 14 / 10px).
- **Do** use Segoe UI Variable Display for titles and Text for UI, and Cascadia Mono only for keys, commands and values.
- **Do** show real numbers only; when a reading is not available yet, show nothing or a dash, never a placeholder figure.
- **Do** honour reduced motion: the global rule collapses every animation and transition.

### Don't:
- **Don't** use black, neon, or glowing edges; the only glow is the faint one behind the Home composer.
- **Don't** build screens as a wall of toggles; lead with the composer, grouped lists and visible state.
- **Don't** load web fonts or icon fonts; icons are inline SVG line icons at 1.75 stroke.
- **Don't** invent light-theme values; the light theme is not built yet.
- **Don't** use the legacy variable names (`--bg-main`, `--bg-sidebar`, `--glass-bg`, `--glass-border`, `--bg-hover`, `--accent`, `--accent-dim`, `--border-accent`, `--accent-glow`, `--text-primary`, `--text-secondary`, `--text-muted`, `--success`, `--warning`, `--r-lg`, `--r-md`, `--r-sm`, `--font-display`, `--font-body`) in new code. They are aliases kept only so screens not yet rebuilt inherit the palette, and are removed once those screens are rebuilt. They are not part of this system.
