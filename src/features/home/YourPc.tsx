"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { readHardware, useHardware } from "@/hooks/useHardware";
import { binGb, cleanBoard, cleanCpu, diskKind, diskSize, ramSummary, vendor, type Hardware } from "@/lib/hardware";
import { fmt } from "@/lib/fmt";
import styles from "./Home.module.css";

interface Spec { label: string; value: string | null; detail?: string | null }

// Virtual adapters (remote desktop, basic display) are not the card in the PC.
const realGpus = (hw: Hardware) => hw.gpus.filter((g) => g.name && !/microsoft basic|remote display|virtual/i.test(g.name));

function specs(hw: Hardware | null, t: (p: string) => string, language: "pt" | "en"): Spec[] {
  const num = new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 });
  const date = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(language === "pt" ? "pt-BR" : "en-US") : null);
  const gpu = hw ? realGpus(hw)[0] : undefined;
  const ram = hw ? ramSummary(hw.ram) : null;
  const disk = hw?.systemDisk;
  // Drops empty parts, including a 0 from a missing number.
  const join = (...parts: (string | number | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || null;
  return [
    {
      label: t("pc.cpu"),
      value: hw?.cpu.name ? cleanCpu(hw.cpu.name) : null,
      detail: hw && join(
        hw.cpu.cores && fmt(t("pc.cores"), { n: hw.cpu.cores }),
        hw.cpu.threads && fmt(t("pc.threads"), { n: hw.cpu.threads }),
        hw.cpu.baseMhz && fmt(t("pc.base"), { v: num.format(hw.cpu.baseMhz / 1000) }),
      ),
    },
    {
      label: t("pc.gpu"),
      value: gpu?.name ?? null,
      detail: gpu && join(gpu.vramBytes && binGb(gpu.vramBytes), gpu.driver && fmt(t("pc.driver"), { v: gpu.driver })),
    },
    { label: t("pc.ram"), value: ram?.total ?? null, detail: ram?.detail },
    {
      label: t("pc.board"),
      value: hw?.board.model ? join(hw.board.maker && vendor(hw.board.maker), cleanBoard(hw.board.model)) : null,
      detail: hw?.board.biosVersion ? join(`BIOS ${hw.board.biosVersion}`, date(hw.board.biosDate)) : null,
    },
    {
      label: t("pc.disk"),
      value: disk ? join(diskKind(disk), disk.bytes && diskSize(disk.bytes)) : null,
      detail: disk?.model,
    },
    {
      label: t("pc.display"),
      value: gpu?.width && gpu.height ? join(`${gpu.width} × ${gpu.height}`, gpu.refreshHz && `${gpu.refreshHz} Hz`) : null,
    },
    {
      label: t("pc.windows"),
      value: hw?.os.name ? join(hw.os.name.replace(/^Microsoft\s+/, ""), hw.os.version) : null,
      detail: hw?.os.build ? fmt(t("pc.build"), { v: hw.os.build }) : null,
    },
    {
      label: t("pc.type"),
      value: hw ? t(hw.laptop ? "pc.laptop" : "pc.desktop") : null,
      detail: hw?.laptop ? t(hw.onBattery ? "pc.on_battery" : "pc.plugged") : null,
    },
  ];
}

/** What this PC is made of, read from Windows. Feeds the hardware-aware suggestions. */
export function YourPc() {
  const { t, language } = useLanguage();
  const { hw, loading, error } = useHardware();

  return (
    <section className={styles.pc} aria-labelledby="your-pc">
      <header className={styles.pcHead}>
        <h2 id="your-pc">{t("pc.title")}</h2>
        {loading && !hw && (
          <span role="status"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> {t("pc.reading")}</span>
        )}
        {!loading && error && !hw && (
          <span role="alert">
            {t("pc.read_failed")}
            <button type="button" onClick={readHardware}><RotateCw size={12} aria-hidden="true" /> {t("pc.retry")}</button>
          </span>
        )}
        {hw && <span>{t("pc.local")}</span>}
      </header>
      <dl className={styles.pcGrid}>
        {specs(hw, t, language).map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd title={[s.value, s.detail].filter(Boolean).join(" · ") || undefined}>
              <b>{s.value ?? "—"}</b>
              {s.detail && <span>{s.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
