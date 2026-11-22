"use client";

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/hooks/useLanguage";
import { useLevel } from "@/hooks/useLevel";
import { showsAction } from "@/lib/level";
import { recordActivity } from "@/lib/history";
import { riskOfAction } from "@/lib/action-risk";
import { RiskLine } from "@/components/ui/RiskLine";
import { fmt } from "@/lib/fmt";
import {
  Trash2,
  Zap,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  History,
  Play,
  LifeBuoy,
  CheckCheck,
  Loader2,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";

// ─── Main Page ───────────────────────────────────────────────
export default function CleanerPage() {
  const { t, language } = useLanguage();
  const { level } = useLevel();
  const [running, setRunning] = useState<string | null>(null);
  const [confirmRisky, setConfirmRisky] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  const ALL_TASKS = [
    { id: "clean_temp", name: t("cleaner.items.temp"), description: "Remove %TEMP% and system temporary files.", category: "Basic" },
    { id: "clean_recycle_bin", name: t("cleaner.items.recycle_bin"), description: "Empties the recycle bin from all drives.", category: "Basic" },
    { id: "clean_prefetch", name: t("cleaner.items.prefetch"), description: "Clears Prefetch folder for consistency.", category: "System" },
    { id: "clean_windows_old", name: t("cleaner.items.win_old"), description: "Removes residues from previous Windows installations.", category: "System" },
    { id: "clean_logs_minidumps", name: t("cleaner.items.logs"), description: "Clears system logs and error memory dumps.", category: "System" },
    { id: "flush_dns", name: t("cleaner.items.dns"), description: "Flushes DNS revolver cache for network latency.", category: "Optimization" },
    { id: "clean_thumbnails", name: t("cleaner.items.thumbnails"), description: "Resets icon and thumbnail cache for cleaner explorer.", category: "Optimization" },
    { id: "clean_delivery_optimization", name: t("cleaner.items.delivery_opt"), description: "Clears Windows Update delivery cache (GBs of space).", category: "Optimization" },
    { id: "clean_windows_update", name: t("cleaner.items.win_update"), description: "Deletes old update files and logs.", category: "System" },
    { id: "clean_shader_cache", name: t("cleaner.items.shader"), description: "Resets DirectX shader cache to fix stuttering.", category: "Gaming" },
  ];

  // Risky cleanups wait for the Advanced level.
  const CLEANUP_TASKS = ALL_TASKS.filter((c) => showsAction(level, riskOfAction(c.id).risk));
  const hiddenTasks = ALL_TASKS.length - CLEANUP_TASKS.length;

  const openSystemRestore = async () => {
    try { await invoke("open_system_restore"); } catch {}
  };

  // `confirmed` lets runAll pass the fresh result: inside runAll the
  // safetyConfirmed state is still the value from before the restore point.
  // Risky items (Windows.old, Recycle Bin) run only from their own card, after a confirmation.
  const askOrRun = (id: string) => {
    if (riskOfAction(id).risk === "risky" && !safetyConfirmed) {
      void runTask(id); // asks for the restore point first
      return;
    }
    if (riskOfAction(id).risk === "risky" && confirmRisky !== id) {
      setConfirmRisky(id);
      return;
    }
    setConfirmRisky(null);
    void runTask(id);
  };

  const runTask = async (id: string, silent = false, confirmed = safetyConfirmed) => {
    if (!confirmed && id !== "flush_dns") {
       if (!silent) alert(t("cleaner.safety_first"));
       return;
    }
    setRunning(id);
    setErrors(({ [id]: _, ...rest }) => rest);
    try {
      await invoke("run_cleanup", { id });
      setCompletedTasks((prev) => new Set(prev).add(id));
      recordActivity({ label: CLEANUP_TASKS.find((c) => c.id === id)?.name ?? id, status: "ok", href: "/cleaner" });
    } catch (err) {
      setErrors((prev) => ({ ...prev, [id]: String(err) }));
      recordActivity({ label: CLEANUP_TASKS.find((c) => c.id === id)?.name ?? id, detail: t("history.failed"), status: "failed", href: "/cleaner" });
    } finally {
      setRunning(null);
    }
  };

  const createRestorePoint = async (): Promise<boolean> => {
    setRestoring(true);
    setErrors(({ restore_point: _, ...rest }) => rest);
    try {
      await invoke("create_restore_point");
      setSafetyConfirmed(true);
      setCompletedTasks((prev) => new Set(prev).add("restore_point"));
      return true;
    } catch (err) {
      setErrors((prev) => ({ ...prev, restore_point: String(err) }));
      return false;
    } finally {
      setRestoring(false);
    }
  };

  const runAll = async () => {
    setIsProcessingAll(true);
    try {
      const confirmed = safetyConfirmed || (await createRestorePoint());
      for (const task of CLEANUP_TASKS.filter((c) => riskOfAction(c.id).risk !== "risky")) await runTask(task.id, true, confirmed);
    } finally {
      setIsProcessingAll(false);
    }
  };

  return (
    <div className="cleaner-page fade-in">
      {/* Immersive Processing Overlay */}
      {isProcessingAll && (
        <div className="processing-overlay-elite">
          <div className="processing-modal-elite">
            <div className="processing-loader">
              <Zap size={32} className="text-accent" />
            </div>
            <div className="processing-status">
              {t("cleaner.clean_btn")}...
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              Performing deep system maintenance.
            </p>
          </div>
        </div>
      )}

      <PageHeader 
        title="Cleaner" 
        description={t("cleaner.subtitle") || "Deep system maintenance and space recovery."}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" style={{ height: 32 }} onClick={openSystemRestore}>
            <LifeBuoy size={14} /> {t("cleaner.restore_btn")}
          </button>
          <button 
            className={`btn btn-sm ${safetyConfirmed ? 'btn-secondary' : 'btn-primary'}`}
            style={{ height: 32 }}
            onClick={createRestorePoint}
            disabled={restoring}
          >
            <History size={14} className={restoring ? "animate-spin" : ""} />
            {restoring ? "..." : t("tweaks.create_point")}
          </button>
          <button className="btn btn-primary btn-sm" style={{ height: 32 }} onClick={runAll} disabled={!!running || isProcessingAll}>
            <Play size={14} /> {t("cleaner.clean_btn")}
          </button>
        </div>
      </PageHeader>

      <p className="cleaner-card-desc" style={{ margin: "0 0 12px" }}>
        {hiddenTasks > 0 ? fmt(t("lv.hidden_actions"), { n: hiddenTasks }) : fmt(t("cleaner.all_skips_risky"), { btn: t("cleaner.clean_btn") })}
      </p>

      {!safetyConfirmed && (
        <div className="admin-banner-elite">
          <ShieldAlert size={16} />
          <span>{errors.restore_point ?? t("cleaner.safety_desc")}</span>
        </div>
      )}

      <div className="elite-columns">
        {["Basic", "System", "Optimization", "Gaming"].map(category => (
          <div key={category} className="category-column">
            <div className="category-title-elite">
              {category === "Gaming" ? <Zap size={14} /> : category === "Security" ? <ShieldCheck size={14} /> : <Trash2 size={14} />}
              {category}
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {CLEANUP_TASKS.filter(t => t.category === category).map(task => (
                <div key={task.id} className={`cleaner-card ${completedTasks.has(task.id) ? 'completed' : ''}`}>
                  <div className="cleaner-card-content">
                    <div className="cleaner-card-title">
                      {task.name}
                      {completedTasks.has(task.id) && <CheckCircle2 size={14} className="text-accent" />}
                    </div>
                    <div className="cleaner-card-desc">{task.description}</div>
                    <RiskLine risk={riskOfAction(task.id).risk} note={riskOfAction(task.id).note?.[language]} />
                    {confirmRisky === task.id && (
                      <div className="cleaner-card-desc" role="alert" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", color: "var(--ink)" }}>
                        {t("cleaner.risky_confirm")}
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => askOrRun(task.id)}>{t("cleaner.risky_yes")}</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRisky(null)}>{t("cleaner.risky_no")}</button>
                      </div>
                    )}
                    {errors[task.id] && (
                      <div className="cleaner-card-desc" role="alert" style={{ color: "var(--danger)" }}>
                        {errors[task.id]}
                      </div>
                    )}
                  </div>
                  
                  <button 
                    className={`btn btn-sm ${completedTasks.has(task.id) ? 'btn-ghost' : 'btn-secondary'}`} 
                    onClick={() => askOrRun(task.id)}
                    disabled={running === task.id || isProcessingAll}
                    style={{ padding: '6px 10px' }}
                  >
                    {running === task.id ? (
                      <RotateCcw size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


