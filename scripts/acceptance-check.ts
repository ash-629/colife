import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../apps/api/config";
const base = `http://127.0.0.1:${config.port}`;
const health = (await fetch(base + "/api/health").then((r) => r.json())) as any;
const state = (await fetch(base + "/api/state").then((r) => r.json())) as any;
const collections = [
  "goals",
  "tasks",
  "habits",
  "checkins",
  "energies",
  "focuses",
  "notes",
  "resources",
  "routes",
  "quizzes",
  "runs",
  "proposals",
  "reviews",
  "activities",
];
if (!health.ok || collections.some((k) => !Array.isArray(state[k])))
  throw new Error("健康或数据契约验证失败");
const assets = readdirSync("dist/web/assets").map((f) =>
  readFileSync(path.join("dist/web/assets", f), "utf8"),
);
if (
  config.apiKey &&
  (JSON.stringify(state).includes(config.apiKey) ||
    JSON.stringify(health).includes(config.apiKey) ||
    assets.some((s) => s.includes(config.apiKey)))
)
  throw new Error("敏感配置隔离验证失败");
console.log(
  JSON.stringify({
    ok: true,
    collections: collections.length,
    secretIsolation: true,
    today: state.today,
    runs: state.runs.map((r: any) => ({ kind: r.kind, status: r.status })),
    database: "SQLite",
  }),
);
