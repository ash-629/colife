// 覆盖 D03/D05/D07/D09：容量、依赖、事务、幂等和持久化。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../apps/api/store";
import { Domain, addDay } from "../apps/api/domain";
const fixture = () => {
  const s = new Store(":memory:"),
    d = new Domain(s);
  const g = d.goal({
    title: "React 学习",
    type: "学习",
    deadline: addDay(d.today(), 7),
    minutes: 120,
  });
  return { s, d, g };
};
test("persistent records survive closing and reopening", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "colife-"));
  try {
    const p = path.join(dir, "test.sqlite"),
      s = new Store(p),
      d = new Domain(s),
      g = d.goal({
        title: "阅读",
        type: "生活",
        deadline: addDay(d.today(), 2),
        minutes: 30,
      });
    s.close();
    const reopened = new Store(p);
    assert.equal(reopened.get("goal", g.id)?.title, "阅读");
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("capacity and invalid dates reject without adding tasks", () => {
  const { s, d, g } = fixture();
  try {
    d.task({ title: "基础", goal: g.id, date: d.today(), minutes: 90 });
    assert.throws(
      () => d.task({ title: "超量", goal: g.id, date: d.today(), minutes: 45 }),
      /可用时间|容量/,
    );
    assert.equal(s.list("task").length, 1);
    assert.throws(() =>
      d.task({ title: "无效", date: "2026-02-30", minutes: 30 }),
    );
    assert.throws(() =>
      d.goal({ title: " ", type: "学习", deadline: d.today(), minutes: 120 }),
    );
  } finally {
    s.close();
  }
});
test("dependency completion and cycle checks", () => {
  const { s, d, g } = fixture();
  try {
    const a = d.task({
        title: "基础",
        goal: g.id,
        date: d.today(),
        minutes: 30,
      }),
      b = d.task({
        title: "实践",
        goal: g.id,
        date: d.today(),
        minutes: 30,
        dependencies: [a.id],
      });
    assert.throws(
      () => d.updateTask(b.id, { status: "done" }),
      /依赖任务未完成/,
    );
    assert.throws(() => d.updateTask(a.id, { dependencies: [b.id] }), /循环/);
    d.updateTask(a.id, { status: "done" });
    d.updateTask(b.id, { status: "done" });
    assert.throws(
      () => d.updateTask(a.id, { date: addDay(d.today(), 1) }),
      /已完成/,
    );
    assert.equal(d.stats(d.today(), d.today()).scheduledDone, 2);
  } finally {
    s.close();
  }
});
test("proposal application is atomic, stale-safe and idempotent", () => {
  const { s, d, g } = fixture();
  try {
    const p = s.put("proposal", {
      goal: g.id,
      status: "pending",
      baseVersion: s.version(),
      tasks: [{ title: "第一步", goal: g.id, date: d.today(), minutes: 30 }],
      moves: [],
    });
    d.apply(p.id);
    d.apply(p.id);
    assert.equal(s.list("task").length, 1);
    const bad = s.put("proposal", {
      goal: g.id,
      status: "pending",
      baseVersion: s.version(),
      tasks: [
        { title: "合规", date: d.today(), minutes: 15 },
        { title: "超量", date: d.today(), minutes: 120 },
      ],
      moves: [],
    });
    assert.throws(() => d.apply(bad.id));
    assert.equal(s.list("task").length, 1);
    const stale = s.put("proposal", {
      goal: g.id,
      status: "pending",
      baseVersion: s.version(),
      tasks: [],
      moves: [],
    });
    d.task({ title: "其他", date: addDay(d.today(), 1), minutes: 20 });
    assert.throws(() => d.apply(stale.id), /数据已变化/);
  } finally {
    s.close();
  }
});
test("habit checkins and quiz feedback are idempotent", () => {
  const { s, d, g } = fixture();
  try {
    const h = d.habit({ name: "阅读", target: "20分钟" });
    d.checkin(h.id, d.today(), true);
    d.checkin(h.id, d.today(), true);
    assert.equal(s.list("checkin").length, 1);
    d.checkin(h.id, d.today(), false);
    assert.equal(s.list("checkin").length, 0);
    const q = s.put("quiz", {
      goal: g.id,
      questions: [
        {
          question: "Q",
          options: ["A", "B", "C", "D"],
          correct: 1,
          topic: "Hooks",
          explanation: "解释",
        },
      ],
    });
    assert.equal("correct" in d.publicQuiz(q).questions[0], false);
    assert.throws(() => d.submitQuiz(q.id, []));
    const answer = d.submitQuiz(q.id, [0]);
    assert.equal(answer.result.score, 0);
    assert.equal(d.submitQuiz(q.id, [1]).result.score, 0);
    assert.equal(d.revision(q.id).id, d.revision(q.id).id);
  } finally {
    s.close();
  }
});
