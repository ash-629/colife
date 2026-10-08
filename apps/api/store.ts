// 覆盖 D03, R02/R04/R06：SQLite持久化、唯一记录与事务。
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
export type Row = {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
};
export class Store {
  db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:")
      mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY); CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,workspace TEXT NOT NULL DEFAULT 'personal',data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS record_scope ON records(workspace,kind); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES('schedule_version',0); INSERT OR IGNORE INTO schema_migrations VALUES(1);`,
    );
  }
  list(kind: string): Row[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM records WHERE kind=? AND workspace=? ORDER BY rowid",
        )
        .all(kind, "personal") as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  get(kind: string, id: string): Row | undefined {
    const r = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=? AND workspace=?")
      .get(kind, id, "personal") as { data: string } | undefined;
    return r ? JSON.parse(r.data) : undefined;
  }
  put(kind: string, data: Record<string, any>, recordId?: string): Row {
    const now = new Date().toISOString(),
      row = {
        ...data,
        id: recordId || data.id || randomUUID(),
        createdAt: data.createdAt || now,
        updatedAt: now,
      };
    this.db
      .prepare(
        "INSERT INTO records(kind,id,workspace,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data WHERE records.workspace=excluded.workspace",
      )
      .run(kind, row.id, "personal", JSON.stringify(row));
    return row;
  }
  delete(kind: string, id: string) {
    this.db
      .prepare("DELETE FROM records WHERE kind=? AND id=? AND workspace=?")
      .run(kind, id, "personal");
  }
  version() {
    return Number(
      (
        this.db
          .prepare("SELECT value FROM meta WHERE key='schedule_version'")
          .get() as { value: number }
      ).value,
    );
  }
  bump() {
    this.db.exec("UPDATE meta SET value=value+1 WHERE key='schedule_version'");
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async backup(file: string) {
    await backup(this.db, file);
  }
  close() {
    this.db.close();
  }
}
