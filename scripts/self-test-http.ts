import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { config } from "../apps/api/config";
const base = "http://127.0.0.1:4011";
const observations: any[] = [];
async function read(url: string) {
  const response = await fetch(base + url);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!config.apiKey || !text.includes(config.apiKey), "secret leak");
  return JSON.parse(text);
}
const state = await read("/api/state");
assert.ok(state.goals.length > 0);
assert.ok(
  state.runs.some((r: any) => r.kind === "plan" && r.status === "applied"),
);
assert.ok(state.quizzes.some((q: any) => q.result?.score === 3));
assert.equal(
  state.tasks.filter((t: any) => t.source === "计划 Agent").length,
  3,
);
assert.ok(
  state.notes.length > 0 &&
    state.resources.length > 0 &&
    state.checkins.length > 0,
);
assert.equal(
  state.focuses.filter((f: any) => f.status === "finished").length,
  1,
);
observations.push({
  check: "real flow persistence",
  goals: state.goals.length,
  tasks: state.tasks.length,
  quizScore: state.quizzes[0].result.score,
  quizTotal: state.quizzes[0].result.total,
  finishedFocus: 1,
});
const times: number[] = [];
for (let batch = 0; batch < 10; batch++) {
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      const start = performance.now();
      await read("/api/state");
      times.push(performance.now() - start);
    }),
  );
}
times.sort((a, b) => a - b);
observations.push({
  check: "100 state GET requests, concurrency 10",
  minMs: +times[0].toFixed(2),
  p50Ms: +times[50].toFixed(2),
  p95Ms: +times[95].toFixed(2),
  maxMs: +times[99].toFixed(2),
});
const home = await fetch(base);
assert.equal(home.status, 200);
assert.match(await home.text(), /CoLife/);
const rejected = await fetch(base + "/api/goals", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://unknown.example",
  },
  body: "{}",
});
assert.equal(rejected.status, 403);
const live = await fetch("http://127.0.0.1:4010/api/health");
assert.equal(live.status, 200);
observations.push({
  check:
    "formal service available; QA untrusted origin blocked; homepage served",
  passed: true,
});
observations.push({
  check: "real model runs",
  runs: state.runs.map((r: any) => ({
    kind: r.kind,
    status: r.status,
    nodes: r.nodes.map((n: any) => ({ agent: n.agent, status: n.status })),
  })),
});
writeFileSync(
  "data/self-test-http.json",
  JSON.stringify(observations, null, 2),
);
console.log(JSON.stringify(observations, null, 2));
