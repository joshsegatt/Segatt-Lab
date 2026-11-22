"use client";

// The lab scene: while a batch of tweaks or cleanups really runs, the mascot
// runs through a giant PC to the part each change touches, works on it, and
// the part lights up when Windows confirms. The counters and the summary come
// from the real results; the animation only follows them, faster when it is
// behind, and never shows a result before the backend gave it.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { closeScene, getScene, useScene, RESTORE_STEP, type SceneStep } from "./store";
import { buildFrames, type Pose } from "./sprites";
import { STATIONS, partNames, type Station } from "@/lib/scene";
import { useHardware } from "@/hooks/useHardware";
import { useLanguage } from "@/hooks/useLanguage";
import { applyTweaks } from "@/hooks/useTweakStates";
import { TWEAKS } from "@/lib/tweaks-catalog";
import { CLEANUPS, formatBytes } from "@/lib/cleanup";
import { localize } from "@/lib/i18n";
import { fmt } from "@/lib/fmt";
import { APP_MARK } from "@/lib/brand";
import styles from "./LabScene.module.css";

/** Art in public/scene: equal-width cells side by side, feet on the bottom edge. */
const SHEETS: Record<Pose, { src: string; frames: number; fps: number }> = {
  idle: { src: "/scene/idle.webp", frames: 4, fps: 5 },
  run: { src: "/scene/run.webp", frames: 6, fps: 12 },
  work: { src: "/scene/work.webp", frames: 4, fps: 8 },
  cheer: { src: "/scene/cheer.webp", frames: 4, fps: 8 },
  shock: { src: "/scene/shock.webp", frames: 4, fps: 12 },
};
const PROPS_SRC = "/scene/props.webp"; // 7 cells in STATIONS order
const BG_SRC = "/scene/bg.webp";

const SPACING = 340;
const MARGIN = 260;
const HERO_H = 230; // on-screen height of the idle mascot; other poses keep his size
/** Where the floor surface sits in bg.webp, as a share of its height. */
const BG_FLOOR = 0.778;
const RUN_SPEED = 300; // px per second

type Sheet = { img: CanvasImageSource; frames: number; fps: number; w: number; h: number; pixel: boolean };
interface Art {
  sheets: Record<Pose, Sheet>;
  props: { img: HTMLImageElement; cell: number } | null;
  bg: HTMLImageElement | null;
}

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadArt(): Promise<Art> {
  const fallback = buildFrames();
  const entries = await Promise.all(
    (Object.keys(SHEETS) as Pose[]).map(async (pose) => {
      const def = SHEETS[pose];
      const img = await load(def.src);
      if (img) return [pose, { img, frames: def.frames, fps: def.fps, w: img.width / def.frames, h: img.height, pixel: false }] as const;
      // Stand-in until the drawn sheets are in public/scene.
      const strip = document.createElement("canvas");
      const f = fallback[pose];
      strip.width = f[0].width * f.length;
      strip.height = f[0].height;
      f.forEach((c, i) => strip.getContext("2d")!.drawImage(c, i * c.width, 0));
      return [pose, { img: strip, frames: f.length, fps: def.fps, w: f[0].width, h: f[0].height, pixel: true }] as const;
    }),
  );
  const [propsImg, bg] = await Promise.all([load(PROPS_SRC), load(BG_SRC)]);
  return {
    sheets: Object.fromEntries(entries) as Record<Pose, Sheet>,
    props: propsImg ? { img: propsImg, cell: propsImg.width / STATIONS.length } : null,
    bg,
  };
}

// ── Deterministic randomness for the procedural background ──────────────────
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JADE = "#3ddc97";
const AMBER = "#f5b84b";

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; gravity: number }

function stationX(s: Station): number {
  return MARGIN + STATIONS.indexOf(s) * SPACING;
}

/** A pixel-art stand-in for a station when props.png is not there yet. */
function drawPropFallback(ctx: CanvasRenderingContext2D, s: Station, cx: number, base: number, t: number, lit: boolean) {
  const u = 4;
  const b = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(cx + x * u), Math.round(base - y * u - h * u), w * u, h * u);
  };
  b(-14, 0, 28, 3, "#1c2420");
  b(-14, 3, 28, 1, "#2c3832");
  switch (s) {
    case "board":
      b(-12, 4, 24, 16, "#0e3b2a");
      b(-6, 8, 9, 7, "#15151b");
      b(5, 9, 5, 5, "#c9ced6");
      for (let i = 0; i < 4; i++) b(-11, 6 + i * 3, 4, 1, "#c99a2e");
      break;
    case "cpu":
      b(-11, 4, 22, 22, "#c99a2e");
      b(-9, 6, 18, 18, "#8d949c");
      b(-8, 7, 16, 16, "#b8bec6");
      b(-2, 13, 4, 4, lit ? JADE : "#6b7280");
      break;
    case "ram":
      for (let i = 0; i < 3; i++) {
        b(-10 + i * 7, 4, 5, 26, "#12573a");
        b(-10 + i * 7, 4, 5, 2, "#c99a2e");
        for (let k = 0; k < 3; k++) b(-9 + i * 7, 9 + k * 7, 3, 4, "#111");
      }
      break;
    case "gpu": {
      b(-17, 4, 34, 12, "#1f2328");
      b(-17, 15, 34, 1, JADE);
      for (const fx of [-8, 8]) {
        ctx.save();
        ctx.translate(cx + fx * u, base - 10 * u);
        ctx.fillStyle = "#2b3036";
        ctx.beginPath();
        ctx.arc(0, 0, 4.5 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(t * (lit ? 9 : 2));
        ctx.fillStyle = "#9aa3ad";
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ctx.fillRect(-u / 2, 0, u, 4 * u);
        }
        ctx.restore();
      }
      break;
    }
    case "display":
      b(-3, 4, 6, 4, "#2b3036");
      b(-15, 8, 30, 18, "#1b1e22");
      b(-14, 9, 28, 16, "#0a1a14");
      ctx.strokeStyle = lit ? JADE : "#1f6b4b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -13; x <= 13; x++) {
        const y = 17 + Math.sin(x * 0.7 + t * 6) * 3;
        const px = cx + x * u;
        const py = base - y * u;
        if (x === -13) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    case "disk":
      b(-15, 4, 4, 4, "#2c3832");
      b(-15, 8, 30, 7, "#0f3d2c");
      b(-11, 9, 6, 5, "#111");
      b(-3, 9, 6, 5, "#111");
      b(5, 10, 8, 3, "#e8ecef");
      break;
    case "net":
      b(-10, 4, 20, 8, "#1d2126");
      for (const ax of [-8, 0, 8]) b(ax, 12, 1, 11, "#2b3036");
      for (let k = 0; k < 4; k++) b(-7 + k * 4, 7, 2, 2, lit && Math.sin(t * 10 + k) > 0 ? JADE : "#1f4a37");
      break;
  }
}

/** The far layer: a giant motherboard wall, drawn once per size. */
function paintBackdrop(w: number, h: number, floor: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0a100e");
  g.addColorStop(1, "#0f1915");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rng(7);
  // Giant capacitors and chips far away.
  for (let x = 0; x < w; x += 90 + r() * 120) {
    const cw = 40 + r() * 50;
    const ch = 120 + r() * (floor * 0.55);
    ctx.fillStyle = "#121b17";
    ctx.fillRect(x, floor - ch, cw, ch);
    ctx.fillStyle = "#17231e";
    ctx.fillRect(x, floor - ch, cw, 8);
    ctx.fillRect(x + cw * 0.2, floor - ch, 4, ch);
  }
  // Circuit traces with right-angle bends and vias.
  ctx.lineWidth = 2;
  for (let i = 0; i < 90; i++) {
    let x = r() * w;
    let y = r() * floor * 0.9;
    ctx.strokeStyle = `rgba(61, 220, 151, ${0.04 + r() * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (k % 2 === 0) x += (r() - 0.5) * 360;
      else y += (r() - 0.5) * 160;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(61, 220, 151, 0.18)";
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  return c;
}

export function LabScene() {
  const { t, language } = useLanguage();
  const scene = useScene();
  const { hw } = useHardware();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atEndRef = useRef(false);
  const [say, setSay] = useState("");
  // The run whose cheer has played; the summary shows after it.
  const [endRun, setEndRun] = useState(0);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const parts = partNames(hw);

  const name = (step: SceneStep) => {
    if (step.id === RESTORE_STEP) return t("sc.restore");
    const list = scene.kind === "cleanup" ? CLEANUPS : TWEAKS;
    return localize(list.find((x) => x.id === step.id)?.name, language) ?? step.id;
  };
  // The canvas loop reads the latest texts and part names through refs.
  const nameRef = useRef(name);
  const tRef = useRef(t);
  const partsRef = useRef(parts);
  useEffect(() => {
    nameRef.current = name;
    tRef.current = t;
    partsRef.current = parts;
  });

  // Esc skips the scene; the work goes on and each screen shows its result.
  useEffect(() => {
    if (!scene.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeScene();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene.open]);

  useEffect(() => {
    if (!scene.open || reduced) return;
    atEndRef.current = false;
    const thisRun = scene.run;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let stopped = false;
    let art: Art | null = null;
    let backdrop: HTMLCanvasElement | null = null;
    let W = 0;
    let H = 0;
    let floor = 0;
    const worldW = MARGIN * 2 + (STATIONS.length - 1) * SPACING;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      floor = Math.round(H * (art?.bg ? BG_FLOOR : 0.72));
      backdrop = paintBackdrop(Math.round(worldW * 0.5 + W), H, floor);
    };
    resize();
    window.addEventListener("resize", resize);

    // Director: one step at a time, in the order the app runs them.
    const d = { i: 0, phase: "intro" as "intro" | "goto" | "work" | "react" | "outro", time: 0, x: MARGIN - 220, pose: "idle" as Pose, frame: 0, frameT: 0, face: 1, cam: 0, said: "" };
    const lit: Record<string, "ok" | "fail" | undefined> = {};
    const particles: Particle[] = [];
    const burst = (x: number, y: number, n: number, colors: string[], speed: number, gravity: number, life = 0.9) => {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life, max: life, color: colors[k % colors.length], size: 3 + Math.round(Math.random() * 3), gravity });
      }
    };
    const speak = (text: string) => {
      if (text !== d.said) {
        d.said = text;
        setSay(text);
      }
    };
    const stationLabel = (s: Station) => tRef.current(`sc.st_${s}`);
    let last = performance.now();
    let clock = 0;

    void loadArt().then((a) => {
      art = a;
      resize();
    });

    const tick = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      const sc = getScene();
      const steps = sc.steps;
      const resolved = steps.filter((s) => s.status === "ok" || s.status === "fail").length;
      // Behind the real work: catch up, up to five times faster.
      const boost = Math.min(5, 1 + Math.max(0, resolved - d.i - 1) * 0.8);
      d.time += dt * boost;

      const step = steps[d.i];
      if (d.phase === "intro") speak(tRef.current("sc.say_intro"));
      if (d.phase === "intro" && d.time > 1.1) {
        d.phase = "goto";
        d.time = 0;
      } else if (d.phase === "goto") {
        if (!step) {
          d.phase = "outro";
          d.time = 0;
        } else {
          const target = stationX(step.station) - 110;
          const dir = Math.sign(target - d.x);
          d.face = dir || d.face;
          d.pose = Math.abs(target - d.x) > 4 ? "run" : "work";
          d.x += dir * Math.min(Math.abs(target - d.x), RUN_SPEED * boost * dt);
          speak(step.id === RESTORE_STEP ? tRef.current("sc.say_restore") : fmt(tRef.current("sc.say_run"), { station: stationLabel(step.station), name: nameRef.current(step) }));
          if (Math.abs(target - d.x) <= 4) {
            d.phase = "work";
            d.time = 0;
            d.face = 1;
          }
        }
      } else if (d.phase === "work" && step) {
        d.pose = "work";
        const done = step.status === "ok" || step.status === "fail";
        if (!done && d.time > 2.5) speak(tRef.current("sc.say_wait"));
        if (done && d.time > 0.7) {
          d.phase = "react";
          d.time = 0;
          lit[step.station] = step.status === "fail" ? "fail" : lit[step.station] === "fail" ? "fail" : "ok";
          const sx = stationX(step.station);
          if (step.status === "ok") {
            burst(sx, floor - 70, 26, [JADE, "#9af5cf", "#ffffff"], 260, 300);
            const lines = ["sc.say_ok_1", "sc.say_ok_2", "sc.say_ok_3"];
            speak(tRef.current(lines[d.i % lines.length]));
          } else {
            burst(d.x + 30, floor - 120, 18, ["#ffe14a", AMBER], 320, 0, 0.5);
            speak(fmt(tRef.current("sc.say_fail"), { name: nameRef.current(step) }));
          }
        }
      } else if (d.phase === "react" && step) {
        d.pose = step.status === "fail" ? "shock" : "idle";
        if (d.time > (step.status === "fail" ? 0.9 : 0.35)) {
          d.i += 1;
          d.phase = "goto";
          d.time = 0;
        }
      } else if (d.phase === "outro") {
        if (sc.finished) {
          d.pose = "cheer";
          if (Math.random() < dt * 14) burst(d.x + (Math.random() - 0.5) * 300, floor - 260, 6, [JADE, "#ff9b1f", "#ffffff", "#9af5cf"], 180, 260, 1.6);
          if (d.time > 0.4 && !atEndRef.current) {
            atEndRef.current = true;
            setEndRun(thisRun);
            speak(tRef.current("sc.say_done"));
          }
        } else {
          d.pose = "idle";
          speak(tRef.current("sc.say_wait"));
        }
      }

      // Sparks while working.
      if (d.pose === "work" && Math.random() < dt * 18) burst(d.x + 70, floor - 40, 3, ["#ffb347", "#ffe14a"], 220, 600, 0.45);

      // Camera follows, eased.
      const camTarget = Math.max(0, Math.min(worldW - W, d.x - W * 0.38));
      d.cam += (camTarget - d.cam) * Math.min(1, dt * 3.2);

      // ── Draw ────────────────────────────────────────────────────────────
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      if (art?.bg) {
        // Cover the screen and the parallax travel; the drawn floor meets ours.
        ctx.imageSmoothingEnabled = true;
        const s = Math.max(H / art.bg.height, (W + (worldW - W) * 0.5) / art.bg.width);
        const bw = art.bg.width * s;
        const bh = art.bg.height * s;
        ctx.drawImage(art.bg, -d.cam * 0.5, floor - BG_FLOOR * bh, bw, bh);
      } else if (backdrop) {
        ctx.drawImage(backdrop, -d.cam * 0.5, 0);
      }

      ctx.save();
      ctx.translate(-Math.round(d.cam), 0);
      // Floor, unless the drawn background brings its own.
      if (!art?.bg) {
      ctx.fillStyle = "#141c18";
      ctx.fillRect(d.cam, floor, W, H - floor);
      ctx.fillStyle = "rgba(61, 220, 151, 0.22)";
      ctx.fillRect(d.cam, floor, W, 2);
      ctx.fillStyle = "#1b2420";
      for (let x = Math.floor(d.cam / 64) * 64; x < d.cam + W; x += 64) ctx.fillRect(x, floor + 2, 2, H - floor);
      }

      // Stations.
      const active = d.phase === "work" || d.phase === "react" ? step?.station : undefined;
      for (const s of STATIONS) {
        const sx = stationX(s);
        if (sx < d.cam - 300 || sx > d.cam + W + 300) continue;
        const state = lit[s];
        const glow = s === active ? JADE : state === "ok" ? JADE : state === "fail" ? AMBER : null;
        if (glow) {
          const pulse = s === active ? 0.28 + Math.sin(clock * 6) * 0.1 : 0.22;
          const rg = ctx.createRadialGradient(sx, floor - 70, 10, sx, floor - 70, 170);
          rg.addColorStop(0, glow === JADE ? `rgba(61, 220, 151, ${pulse})` : `rgba(245, 184, 75, ${pulse})`);
          rg.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = rg;
          ctx.fillRect(sx - 180, floor - 250, 360, 260);
        }
        if (art?.props) {
          const cell = art.props.cell;
          const ph = 210;
          const pw = ph * (cell / art.props.img.height);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(art.props.img, STATIONS.indexOf(s) * cell, 0, cell, art.props.img.height, sx - pw / 2, floor - ph, pw, ph);
          ctx.imageSmoothingEnabled = false;
        } else {
          drawPropFallback(ctx, s, sx, floor, clock, s === active || state === "ok");
        }
        // Label under the floor line: the part's name and what Windows calls it.
        ctx.fillStyle = "rgba(8, 12, 10, 0.72)";
        ctx.beginPath();
        ctx.roundRect(sx - 140, floor + 12, 280, partsRef.current[s] ? 46 : 28, 10);
        ctx.fill();
        ctx.textAlign = "center";
        ctx.fillStyle = "#ededed";
        ctx.font = '600 14px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
        ctx.fillText(stationLabel(s), sx, floor + 30);
        const part = partsRef.current[s];
        if (part) {
          ctx.fillStyle = "#b9c2bd";
          ctx.font = '12px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
          let txt = part;
          while (ctx.measureText(txt).width > 260 && txt.length > 4) txt = txt.slice(0, -2);
          ctx.fillText(txt === part ? txt : `${txt}…`, sx, floor + 48);
        }
      }

      // The energy beam from the chip to the part being worked on.
      if (step && d.phase === "work") {
        const sx = stationX(step.station);
        const fromX = d.x + 46;
        const fromY = floor - HERO_H * 0.55;
        ctx.strokeStyle = `rgba(61, 220, 151, ${0.55 + Math.sin(clock * 30) * 0.25})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        for (let k = 1; k <= 8; k++) {
          const px = fromX + ((sx - 30 - fromX) * k) / 8;
          const py = fromY + ((floor - 90 - fromY) * k) / 8 + (k < 8 ? (Math.random() - 0.5) * 16 : 0);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Particles.
      for (let k = particles.length - 1; k >= 0; k--) {
        const p = particles[k];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(k, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // The mascot.
      if (art) {
        const sheet = art.sheets[d.pose];
        d.frameT += dt * boost;
        if (d.frameT > 1 / sheet.fps) {
          d.frameT = 0;
          d.frame = (d.frame + 1) % sheet.frames;
        }
        const f = d.frame % sheet.frames;
        // One scale for every pose (set by idle), so he keeps his size.
        const unit = HERO_H / art.sheets.idle.h;
        const w = sheet.w * unit;
        const h = sheet.h * unit;
        ctx.save();
        ctx.translate(Math.round(d.x), floor);
        if (d.face < 0) ctx.scale(-1, 1);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 2, w * 0.32, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pixel stand-ins stay sharp; drawn art is scaled smoothly.
        ctx.imageSmoothingEnabled = !sheet.pixel;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(sheet.img, f * sheet.w, 0, sheet.w, sheet.h, -w / 2, -h, w, h);
        ctx.imageSmoothingEnabled = false;
        ctx.restore();
      }
      ctx.restore();

      // Vignette.
      const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "rgba(0, 0, 0, 0)");
      vg.addColorStop(1, "rgba(0, 0, 0, 0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // A new run restarts the story.
  }, [scene.open, scene.run, reduced]);

  if (!scene.open) return null;

  const steps = scene.steps;
  const real = steps.filter((s) => s.id !== RESTORE_STEP);
  const ok = real.filter((s) => s.status === "ok");
  const failed = real.filter((s) => s.status === "fail");
  const done = ok.length + failed.length;
  const title = fmt(t(`sc.title_${scene.kind}`), { n: real.length });
  const showSummary = scene.finished && (endRun === scene.run || reduced);

  const undo = () => {
    const ids = ok.map((s) => s.id);
    closeScene();
    void applyTweaks(ids.map((id) => [id, false]), () => {});
  };

  return (
    <div className={styles.scene} role="dialog" aria-modal="true" aria-labelledby="sc-title">
      {!reduced && <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />}

      <header className={styles.hud}>
        <div className={styles.hudText}>
          <h2 id="sc-title" className={styles.title}>{title}</h2>
          <span className={styles.count} aria-live="polite">{fmt(t("sc.count"), { done, n: real.length })}</span>
        </div>
        <div className={styles.bar}><div className={styles.fill} style={{ width: `${real.length ? (done / real.length) * 100 : 0}%` }} /></div>
        <button type="button" className={`btn btn-secondary btn-sm ${styles.skip}`} onClick={closeScene}>
          <X size={14} aria-hidden="true" />{t("sc.skip")}
        </button>
      </header>

      {reduced && (
        <ol className={styles.list}>
          {steps.map((s) => (
            <li key={s.id} className={styles[`li_${s.status}`]}>
              <span>{name(s)}</span>
              <small>{t(`sc.st_${s.station}`)}</small>
            </li>
          ))}
        </ol>
      )}

      {!reduced && say && !showSummary && (
        <div className={styles.dialog}>
          <Image className={styles.portrait} src={APP_MARK} alt="" width={64} height={64} />
          <div>
            <b className={styles.speaker}>{t("sc.name")}</b>
            <p key={say} className={styles.line}>{say}</p>
          </div>
        </div>
      )}

      {showSummary && (
        <section className={styles.summary} aria-live="polite">
          <h3>{failed.length ? fmt(t("sc.done_some"), { ok: ok.length, n: real.length }) : t("sc.done_title")}</h3>
          {scene.kind === "cleanup" && scene.freed !== null && <p className={styles.freed}>{fmt(t("sc.freed"), { size: formatBytes(scene.freed, language) })}</p>}
          {failed.length > 0 && (
            <ul className={styles.fails}>
              {failed.map((s) => (
                <li key={s.id}><b>{name(s)}</b>{s.reason ? <span> · {s.reason.split("\n")[0]}</span> : null}</li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            {scene.kind === "tweaks" && ok.length > 0 && <button type="button" className="btn btn-secondary" onClick={undo}>{t("sc.undo")}</button>}
            <button type="button" className="btn btn-primary" onClick={closeScene} autoFocus>{t("sc.close")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
