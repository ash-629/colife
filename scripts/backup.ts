import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "../apps/api/config";
import { Store } from "../apps/api/store";
const directory = path.resolve("backups");
mkdirSync(directory, { recursive: true });
const file = path.join(
  directory,
  `colife-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
const store = new Store(config.database);
try {
  await store.backup(file);
  console.log(JSON.stringify({ ok: true, backup: file }));
} finally {
  store.close();
}
