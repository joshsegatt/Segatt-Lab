"use client";

import { TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { Risk } from "@/lib/tweaks-catalog";
import styles from "@/components/ui/Screen.module.css";

/** "Moderado · what you may notice" under an action; nothing for safe ones. */
export function RiskLine({ risk, note }: { risk: Risk; note?: string }) {
  const { t } = useLanguage();
  if (risk === "safe") return null;
  return (
    <span className={`${styles.riskNote} ${risk === "risky" ? styles.riskRisky : styles.riskModerate}`}>
      <TriangleAlert size={13} aria-hidden="true" />
      <span>
        <b>{t(`tw.risk_${risk}`)}</b> · {note}
      </span>
    </span>
  );
}
