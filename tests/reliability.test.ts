import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../apps/api/store";
import { Domain, addDay } from "../apps/api/domain";
import { Runs } from "../apps/api/runs";
const fixture = () => {
  const s = new Store(":memory:"),
    d = new Domain(s),
    g = d.goal({
      title: "学习",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
  return { s, d, g };
};
test("settings and goal capacity changes roll back when existing tasks conflict", () => {
  const { s, d, g } = fixture();
  try {
    d.task({ title: "学习", goal: g.id, date: d.today(), minutes: 90 });
    const version = s.version();
    assert.throws(() => d.updateGoal(g.id, { minutes: 30 }));
    assert.equal(d.require("goal", g.id).minutes, 120);
    assert.throws(() =>
      d.updateSettings({
        ...d.settings(),
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        dailyMinutes: 30,
      }),
    );
    const { timezone, dailyMinutes, fixed, agents } = d.settings();
    assert.throws(() =>
      d.updateSettings({ timezone, dailyMinutes: 30, fixed, agents }),
    );
    assert.equal(d.settings().dailyMinutes, dailyMinutes);
    assert.equal(s.version(), version);
  } finally {
    s.close();
  }
});
test("focus preserves paused time and counts completed sessions only", () => {
  const { s, d } = fixture();
  try {
    const t = d.task({ title: "实践", date: d.today(), minutes: 30 }),
      f = d.focus(t.id);
    assert.throws(() => d.focus(t.id));
    s.put("focus", { ...f, resumedAt: Date.now() - 125000 }, f.id);
    const paused = d.focusAction(f.id, "pause");
    assert.ok(paused.elapsedSeconds >= 124);
    assert.equal(d.stats(d.today(), d.today()).focusMinutes, 0);
    const resumed = d.focusAction(f.id, "resume");
    assert.equal(resumed.elapsedSeconds, paused.elapsedSeconds);
    d.focusAction(f.id, "finish");
    const complete = d.focusAction(f.id, "finish");
    assert.equal(
      d.stats(d.today(), d.today()).focusMinutes,
      Math.floor(complete.elapsedSeconds / 60),
    );
    assert.equal(d.stats(addDay(d.today(), -6), d.today()).trend.length, 7);
  } finally {
    s.close();
  }
});
test("fixed reservations cannot exceed capacity on otherwise empty dates", () => {
  const { s, d } = fixture();
  try {
    const { timezone, dailyMinutes, agents } = d.settings();
    assert.throws(
      () =>
        d.updateSettings({
          timezone,
          dailyMinutes,
          agents,
          fixed: [
            { id: "fixed", title: "固定安排", date: d.today(), minutes: 150 },
          ],
        }),
      /容量/,
    );
    assert.equal(d.settings().fixed.length, 0);
  } finally {
    s.close();
  }
});
test("revision chooses available date and cannot duplicate tasks", () => {
  const { s, d, g } = fixture();
  try {
    d.task({
      title: "已安排",
      goal: g.id,
      date: addDay(d.today(), 1),
      minutes: 110,
    });
    const q = s.put("quiz", {
      goal: g.id,
      questions: [
        {
          question: "Q",
          options: ["A", "B", "C", "D"],
          correct: 1,
          topic: "状态",
          explanation: "解释",
        },
      ],
    });
    d.submitQuiz(q.id, [0]);
    const p = d.revision(q.id);
    assert.equal(p.tasks[0].date, addDay(d.today(), 2));
    d.apply(p.id);
    d.apply(p.id);
    assert.equal(s.list("task").length, 2);
    assert.equal(d.revision(q.id).id, p.id);
  } finally {
    s.close();
  }
});
test("restart restores interrupted runs without losing accepted tasks", async () => {
  const { s, d, g } = fixture();
  const t = d.task({
    title: "已接受",
    goal: g.id,
    date: d.today(),
    minutes: 30,
  });
  s.put("goal", { ...g, status: "planning" }, g.id);
  const r = s.put("run", {
    goal: g.id,
    status: "running",
    nodes: [{ agent: "coordinator", status: "running" }],
  });
  const engine = new Runs(d);
  try {
    assert.equal(engine.get(r.id).status, "failed");
    assert.equal(d.require("goal", g.id).status, "active");
    assert.equal(d.require("task", t.id).title, "已接受");
  } finally {
    await engine.close();
    s.close();
  }
});
test("stale revision regenerates in same proposal without duplicate feedback", () => {
  const { s, d, g } = fixture();
  try {
    const q = s.put("quiz", {
      goal: g.id,
      questions: [
        {
          question: "Q",
          options: ["A", "B", "C", "D"],
          correct: 1,
          topic: "状态",
          explanation: "解释",
        },
      ],
    });
    d.submitQuiz(q.id, [0]);
    const p = d.revision(q.id);
    d.energy(d.today(), "疲惫");
    assert.throws(() => d.apply(p.id), /变化/);
    const refreshed = d.revision(q.id);
    assert.equal(refreshed.id, p.id);
    assert.equal(refreshed.baseVersion, s.version());
    d.apply(refreshed.id);
    assert.equal(s.list("task").length, 1);
  } finally {
    s.close();
  }
});
test("rejected revision regenerates with current capacity and stays idempotent", () => {
  const { s, d, g } = fixture();
  try {
    const q = s.put("quiz", {
      goal: g.id,
      questions: [
        {
          question: "Q",
          options: ["A", "B", "C", "D"],
          correct: 1,
          topic: "状态",
          explanation: "解释",
        },
      ],
    });
    d.submitQuiz(q.id, [0]);
    const p = d.revision(q.id);
    d.reject(p.id);
    assert.throws(() => d.apply(p.id), /不可应用/);
    const regenerated = d.revision(q.id);
    assert.equal(regenerated.id, p.id);
    assert.equal(regenerated.status, "pending");
    assert.equal(s.list("task").length, 0);
    assert.equal(d.revision(q.id).id, p.id);
    d.apply(regenerated.id);
    d.apply(regenerated.id);
    assert.equal(s.list("task").length, 1);
    assert.equal(d.revision(q.id).status, "applied");
  } finally {
    s.close();
  }
});
test("public state has all page collections and hides unsubmitted quiz answers", () => {
  const { s, d, g } = fixture();
  try {
    s.put("quiz", {
      goal: g.id,
      questions: [
        {
          question: "Q",
          options: ["A", "B", "C", "D"],
          correct: 1,
          topic: "状态",
          explanation: "解释",
        },
      ],
    });
    const state = d.state() as any;
    for (const name of [
      "goals",
      "tasks",
      "habits",
      "energies",
      "focuses",
      "quizzes",
      "activities",
    ])
      assert.ok(Array.isArray(state[name]));
    assert.equal("correct" in state.quizzes[0].questions[0], false);
    assert.equal("explanation" in state.quizzes[0].questions[0], false);
    assert.throws(() =>
      d.checkin(
        d.habit({ name: "阅读", target: "20分钟" }).id,
        addDay(d.today(), 1),
        true,
      ),
    );
  } finally {
    s.close();
  }
});
test("SQLite online backup contains committed records and migration", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "colife-backup-"));
  const { s, d } = fixture();
  try {
    const target = path.join(directory, "backup.sqlite");
    await s.backup(target);
    const copy = new Store(target);
    try {
      assert.equal(copy.list("goal").length, 1);
      assert.equal(
        copy.db.prepare("SELECT version FROM schema_migrations").get()?.version,
        1,
      );
      assert.equal(
        copy.db.prepare("PRAGMA integrity_check").get()?.integrity_check,
        "ok",
      );
    } finally {
      copy.close();
    }
  } finally {
    s.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
