import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
const source = process.argv[2];
if (!source || !existsSync(source))
  throw new Error("请提供存在的 SQLite 备份文件路径");
mkdirSync(path.resolve("data"), { recursive: true });
const target = path.resolve("data", `restored-${Date.now()}.sqlite`);
const db = new DatabaseSync(path.resolve(source), { readOnly: true });
try {
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
    throw new Error("备份完整性检查失败");
  if (!db.prepare("SELECT version FROM schema_migrations").get())
    throw new Error("不是 CoLife 数据库");
  await backup(db, target);
  console.log(
    JSON.stringify({
      ok: true,
      database: target,
      next: "停止应用，将 .env 的 DATABASE_PATH 改为此路径，再启动。原数据库保留。",
    }),
  );
} finally {
  db.close();
}
