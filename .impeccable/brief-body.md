Scope: the whole desktop app shell (sidebar, top bar, Home) and every working screen that inherits it. Mode: Operate.

Audience and job: gamers and PC enthusiasts tuning their own Windows PC; find an action, see the real state, apply or revert it, read the result.

Unresolved: final product name (working name in one constant); light theme ships after dark; 8 more languages ship after the screens settle.

Approved by the owner on 2026-11-21 ("Aprovado, constrói"): `.impeccable/mocks/v2/home.png`, `.impeccable/mocks/v2/home-search.png`, `.impeccable/mocks/v2/tweaks.png`. They are the critique reference for this code-led build.

Phase 1 adaptations (cited, temporary): the app cannot yet read each tweak's real state, cleanup sizes or pending app updates; those readers arrive with the tweak engine (phase 2) and winget detection (phase 3). Until then, and to show no invented numbers: result rows carry no state tag; the fourth state cell shows uptime instead of active tweaks; preset pills show their tweak count and the cleanup/repair pills show no number; the sidebar shows no counts. The composer has no mode chip because the product has no modes; the restore-point line is plain information, not a control. The lead result opens the preset for review (Enter = open), so it is titled with the preset name, not "Apply".

## Direction contract

THESIS: A command-first Windows tuner that reads like the modern AI desktop apps (Copilot, ChatGPT, Antigravity): one calm composer finds every action, and every screen shows the PC's real state. It refuses the gamer-tool default of black, neon and glowing edges, and the settings-page default of a wall of toggles.

OWN-WORLD: Warm neutral graphite surfaces (#131313 sidebar, #1a1a1a canvas, #242424 raised), soft 1px light hairlines, one jade brand accent (#3ddc97) reserved for live/active state and the primary action, amber for pending, red for failed. Segoe UI Variable (Display for titles, Text for UI), Cascadia Mono only for commands, keys and values. Large radii (28px composer, 20px groups, pills for buttons and chips), soft offset shadows, one faint jade-amber glow behind the composer only.

STORY: The visitor opens the app, sees one question and a composer, types what they want ("jogo"), sees the whole preset as the first result plus individual tweaks, apps and cleanups with their live state, applies with Enter, and follows the result in the sidebar history.

FIRST VIEWPORT: Home: 264px sidebar (brand, six nav items with live counts, Today/Yesterday history, PC chip at the bottom); top bar with admin status pill; centered 34px question, one-line promise, 760px composer with restore-point and mode chips and a round send button, four suggestion pills with real numbers, then a four-cell state strip (CPU, memory, disk, active tweaks). Tweaks: 860px column, preset segmented control and search, grouped rounded lists with state tag and switch per row, expandable detail with exact command and before/after value, inline failure with retry, floating pending-changes dock.

FORM: canon direction chosen by the owner, played straight at the craft level of Copilot, the ChatGPT app and Antigravity; not from the rolled list. seed:2baae1424fc9c97c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
