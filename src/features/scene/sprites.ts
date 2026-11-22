// The lab scene's mascot, drawn pixel by pixel: the same scientist as the logo,
// as a small game sprite. Parts are composed into frames so every pose shares
// one head, one coat and one palette, and a 1-px dark outline is added last.

const PALETTE: Record<string, string> = {
  H: "#f4f2f8", h: "#b9b6cc", // hair
  S: "#9a5a34", s: "#6e3d22", // skin
  G: "#e8a531", O: "#ff9b1f", o: "#ffd98a", // goggles
  M: "#e9e7ef", // mustache and goatee
  W: "#f2f5f5", w: "#a9c3c3", // lab coat
  N: "#2a2e52", // sweater
  P: "#3b3c48", B: "#5b3a21", // trousers, shoes
  C: "#3fd1b0", c: "#e8a531", // chip and its pins
  R: "#c3cad2", r: "#7d8794", // wrench
};
const OUTLINE = "#120f1a";

export const SPRITE_W = 26;
export const SPRITE_H = 34;

const HEAD = [
  "..H.HH.H.H..",
  ".HHHHHHHHHH.",
  "HHHHHHHHHHHH",
  "HHhSSSSSSHHH",
  "HhSSSGGGGGGH",
  "HhSSGOoGOoG.",
  "HSSSGOOGOOG.",
  "HSSSSGGSGGS.",
  ".SSSSSSSSSS.",
  ".sSSMMMMMMS.",
  "..sSSMMMMS..",
  "....SMMS....",
];
const SPIKES = ["H..H.H..H.H.", ".H.H..H.H..H"];

const TORSO = [
  "...WWNNWW...",
  "..WWWNNWWW..",
  ".WWWwNNwWWW.",
  ".WWWwNNwWWW.",
  ".WWWWNNWWWW.",
  ".WWWwNNwWWW.",
  ".WWWWNNWWWW.",
  "..WWWNNWWW..",
  "..WWw..wWW..",
];

const LEGS: Record<string, string[]> = {
  stand: [
    "...PP..PP...",
    "...PP..PP...",
    "...PP..PP...",
    "...PP..PP...",
    "...PP..PP...",
    "..BBB..BBB..",
    "..BBBB.BBBB.",
  ],
  runA: [
    "...PP..PP...",
    "..PP....PP..",
    ".PP......PP.",
    ".PP.......PP",
    "BBB.......BB",
    "BB.......BBB",
    "............",
  ],
  runB: [
    "....PPPP....",
    "....PPPP....",
    "....PPP.....",
    "...PPPP.....",
    "...PP.PP....",
    "..BBB.BBB...",
    "..BBBB.BBBB.",
  ],
  crouch: [
    "..PPP..PPP..",
    ".PP......PP.",
    ".PP......PP.",
    "BBBB....BBBB",
    "............",
    "............",
    "............",
  ],
  tuck: [
    "..PP....PP..",
    "...PP..PP...",
    "..BBB..BBB..",
    "............",
    "............",
    "............",
    "............",
  ],
};

const ARM_DOWN = ["WW", "WW", "WW", "Ww", "Ww", "WW", "SS", "SS"];
const ARM_UP = ["SS", "SS", "WW", "Ww", "Ww", "WW", "WW", "WW"];
const ARM_OUT = ["WWWWSS", "WwwWSS"];
const CHIP = [".cc.", "cCCc", "cCCc", ".cc."];
const WRENCH_UP = ["R.R", "RRR", ".R.", ".r.", ".r.", ".r."];
const WRENCH_DOWN = ["...rrrRR", "....rrR.", ".....RRR"];

type Part = [string[], number, number];

function compose(parts: Part[]): string[][] {
  const g: string[][] = Array.from({ length: SPRITE_H }, () => Array(SPRITE_W).fill("."));
  for (const [rows, x, y] of parts) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const gx = x + dx;
        const gy = y + dy;
        if (ch !== "." && gx >= 0 && gy >= 0 && gx < SPRITE_W && gy < SPRITE_H) g[gy][gx] = ch;
      });
    });
  }
  // The dark outline every pixel-art sprite carries.
  const out = g.map((r) => [...r]);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (g[y][x] !== ".") continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== ".");
      if (near) out[y][x] = "K";
    }
  }
  return out;
}

/** Body parts of a pose, around a 12-px-wide body whose left edge is at x=7. */
function pose(name: string, f: number): Part[] {
  const bx = 7;
  switch (name) {
    case "idle": {
      const b = f % 2; // a one-pixel breath
      return [[HEAD, bx, 1 + b], [TORSO, bx, 13 + b], [LEGS.stand, bx, 22], [ARM_DOWN, bx - 1, 14 + b], [ARM_DOWN, bx + 11, 14 + b], [CHIP, bx + 12, 20 + b]];
    }
    case "run": {
      const legs = [LEGS.runA, LEGS.runB, LEGS.runA, LEGS.runB][f % 4];
      const up = f % 2 === 1 ? 1 : 0;
      const swing = f % 4 < 2 ? 1 : -1;
      return [[HEAD, bx + 1, 1 + up], [TORSO, bx, 13 + up], [legs, bx, 22], [ARM_DOWN, bx - 1 - swing, 14 + up], [ARM_DOWN, bx + 11 + swing, 14 + up]];
    }
    case "work": {
      const hit = f % 2 === 1;
      const parts: Part[] = [[HEAD, bx + 1, 4], [TORSO, bx, 15], [LEGS.crouch, bx, 24], [ARM_DOWN, bx - 1, 16]];
      if (hit) parts.push([ARM_OUT, bx + 10, 18], [WRENCH_DOWN, bx + 14, 18]);
      else parts.push([ARM_UP, bx + 11, 9], [WRENCH_UP, bx + 11, 3]);
      return parts;
    }
    case "cheer": {
      const y = f % 2 === 0 ? -1 : -3;
      return [[HEAD, bx, 3 + y], [TORSO, bx, 15 + y], [LEGS.tuck, bx, 24 + y], [ARM_UP, bx - 2, 8 + y], [ARM_UP, bx + 12, 8 + y]];
    }
    case "shock": {
      const j = f % 2 === 0 ? 0 : 1;
      return [[[SPIKES[f % 2]], bx + j, 0], [HEAD, bx + j, 1], [TORSO, bx, 13], [LEGS.stand, bx, 22], [ARM_OUT, bx - 5, 15], [["SSWWWW", "SSwwwW"], bx + 11, 15]];
    }
    default:
      return [];
  }
}

export type Pose = "idle" | "run" | "work" | "cheer" | "shock";
export const FRAMES: Record<Pose, number> = { idle: 2, run: 4, work: 2, cheer: 2, shock: 2 };

/** Every frame as a small canvas, drawn once; the scene scales them without smoothing. */
export function buildFrames(): Record<Pose, HTMLCanvasElement[]> {
  const out = {} as Record<Pose, HTMLCanvasElement[]>;
  for (const name of Object.keys(FRAMES) as Pose[]) {
    out[name] = Array.from({ length: FRAMES[name] }, (_, f) => {
      const grid = compose(pose(name, f));
      const c = document.createElement("canvas");
      c.width = SPRITE_W;
      c.height = SPRITE_H;
      const ctx = c.getContext("2d")!;
      grid.forEach((row, y) =>
        row.forEach((ch, x) => {
          if (ch === ".") return;
          ctx.fillStyle = ch === "K" ? OUTLINE : PALETTE[ch];
          ctx.fillRect(x, y, 1, 1);
        }),
      );
      return c;
    });
  }
  return out;
}
