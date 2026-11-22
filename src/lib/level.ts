// How much of the app a person sees, picked at the end of onboarding.
// Tweaks follow the full scale; one-shot actions (Cleaner, Fixes, Control)
// only hide what is risky. Anything already on stays visible at every level,
// so it can always be undone. Pure functions: tested in Node.

import type { Language } from "@/lib/i18n";
// Relative with extension so the Node test runner can load it too.
import type { Risk } from "./tweaks-catalog.ts";

export type Level = "beginner" | "intermediate" | "advanced";
export const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

const RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const NEEDS: Record<Risk, Level> = { safe: "beginner", moderate: "intermediate", risky: "advanced" };

export const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as string[]).includes(v);

/** The lowest level that sees a tweak of this risk. */
export const levelFor = (risk: Risk): Level => NEEDS[risk];

/** A tweak of this risk is offered at this level. */
export const allows = (level: Level, risk: Risk) => RANK[level] >= RANK[NEEDS[risk]];

/** A tweak row is listed: offered at this level, or already on (so it can be turned off). */
export const showsTweak = (level: Level, risk: Risk, on: boolean) => on || allows(level, risk);

/** A Cleaner, Fixes or Control action is listed: only risky ones wait for Advanced. */
export const showsAction = (level: Level, risk: Risk, current = false) => current || risk !== "risky" || level === "advanced";

/** Keeps the tweaks this level is offered. */
export const forLevel = <T extends { risk: Risk }>(items: T[], level: Level): T[] => items.filter((i) => allows(level, i.risk));

export const LEVEL_TEXT: Record<Level, { name: Record<Language, string>; who: Record<Language, string>; sees: Record<Language, string> }> = {
  beginner: {
    name: { pt: "Iniciante", en: "Beginner" },
    who: { pt: "Quero o PC mais rápido sem correr risco.", en: "I want a faster PC without taking risks." },
    sees: { pt: "Só ajustes seguros e os presets prontos. Nada de registro na tela.", en: "Only safe tweaks and the ready presets. No registry on screen." },
  },
  intermediate: {
    name: { pt: "Intermediário", en: "Intermediate" },
    who: { pt: "Já mexi nas configurações do Windows.", en: "I have changed Windows settings before." },
    sees: { pt: "Inclui ajustes moderados, cada um dizendo o que pode mudar.", en: "Adds moderate tweaks, each saying what it may change." },
  },
  advanced: {
    name: { pt: "Avançado", en: "Advanced" },
    who: { pt: "Sei o que são registro, serviços e políticas.", en: "I know what the registry, services and policies are." },
    sees: { pt: "Tudo, inclusive o arriscado, sempre com confirmação e ponto de restauração.", en: "Everything, risky included, always with a confirmation and a restore point." },
  },
};
