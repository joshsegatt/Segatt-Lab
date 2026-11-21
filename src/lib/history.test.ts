import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByDay, type Activity } from "./history.ts";

const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).getTime();
const entry = (id: string, time: number): Activity => ({ id, label: id, status: "ok", at: time });

test("groups activity by local calendar day", () => {
  const now = new Date(2026, 10, 21, 9);
  const groups = groupByDay(
    [entry("a", at(2026, 10, 21, 8)), entry("b", at(2026, 10, 20, 23)), entry("c", at(2026, 10, 19, 12))],
    now,
  );
  assert.deepEqual(groups.map((g) => [g.key, g.items.map((i) => i.id)]), [
    ["today", ["a"]],
    ["yesterday", ["b"]],
    ["earlier", ["c"]],
  ]);
});

test("empty groups are left out", () => {
  const now = new Date(2026, 10, 21, 9);
  assert.deepEqual(groupByDay([entry("a", at(2026, 10, 21, 1))], now).map((g) => g.key), ["today"]);
});
