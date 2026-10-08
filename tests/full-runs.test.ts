import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../apps/api/store";
import { Domain, addDay } from "../apps/api/domain";
import { Runs } from "../apps/api/runs";

async function wait(engine: Runs, id: string) {
  for (let i = 0; i < 500; i++) {
    const r = engine.get(id);
    if (!["queued", "running"].includes(r.status)) return r;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("run timeout");
}
const output = (role: string, c: any, plan: any) => {
  if (role === "协调 Agent") return { summary: "协调完成", intent: "执行" };
  if (role === "学习 Agent" && c.request.kind === "quiz")
    return {
      summary: "测验",
      questions: Array.from({ length: 3 }, () => ({
        question: "题目",
        options: ["A", "B", "C", "D"],
        correct: 1,
        topic: "状态管理",
        explanation: "答案解释",
      })),
    };
  if (role === "学习 Agent")
    return {
      summary: "路线",
      stages: [{ title: "基础", description: "基础学习" }],
    };
  if (role === "生活 Agent")
    return { summary: "生活", constraints: ["遵守容量"] };
  if (role === "计划 Agent")
    return {
      summary: "计划",
      reason: "调整安排",
      tasks: [],
      moves: [],
      ...plan,
    };
  return { summary: "复盘", analysis: "依据事实", suggestions: ["继续"] };
};
const setup = (type = "学习", plan: any = {}) => {
  const s = new Store(":memory:"),
    d = new Domain(s),
    g = d.goal({
      title: "测试目标",
      type,
      deadline: addDay(d.today(), 10),
      minutes: 120,
      criteria: "完成任务",
    });
  const e = new Runs(d, async (role, schema, c) =>
    schema.parse(output(role, c, plan)),
  );
  return { s, d, g, e };
};

test("required Agent guards, immutable snapshot and optional skip", async () => {
  const { s, d, g, e } = setup();
  try {
    const settings = d.settings();
    const input = {
      timezone: settings.timezone,
      dailyMinutes: 120,
      fixed: [],
      agents: { ...settings.agents, planner: false },
    };
    d.updateSettings(input);
    assert.throws(() => e.start({ kind: "plan", goal: g.id }), /必需/);
    d.updateSettings({ ...input, agents: { ...settings.agents, life: false } });
    const run = e.start({ kind: "plan", goal: g.id });
    assert.throws(() => e.start({ kind: "quiz", goal: g.id }), /正在运行/);
    const done = await wait(e, run.id);
    assert.equal(done.status, "pending");
    assert.equal(
      done.nodes.find((n: any) => n.agent === "life").status,
      "skipped",
    );
    assert.equal(done.configSnapshot.life, false);
    assert.equal("context" in JSON.parse(JSON.stringify(done)), false);
    assert.throws(() => e.retry(run.id), /仅失败/);
    assert.throws(() => e.cancel(run.id), /不能取消/);
    d.reject(done.proposal);
    assert.equal(e.get(run.id).status, "rejected");
    assert.throws(() => d.apply(done.proposal), /不可应用/);
    assert.equal(s.list("task").length, 0);
  } finally {
    await e.close();
    s.close();
  }
});

test("life goals, terminal goal and review range guard", async () => {
  const { s, d, g, e } = setup("生活");
  try {
    assert.throws(() => e.start({ kind: "quiz", goal: g.id }), /学习目标/);
    const r = e.start({ kind: "plan", goal: g.id });
    assert.equal((await wait(e, r.id)).status, "pending");
    d.reject(e.get(r.id).proposal);
    d.updateGoal(g.id, { status: "archived" });
    assert.throws(() => e.start({ kind: "plan", goal: g.id }), /完成或归档/);
    assert.throws(
      () => e.start({ kind: "review", from: "2026-10-09", to: "2026-10-08" }),
      /范围/,
    );
  } finally {
    await e.close();
    s.close();
  }
});

for (const kind of [
  "unknown move",
  "done move",
  "new task on reschedule",
  "duplicate reference",
  "unknown reference",
  "cycle reference",
])
  test(`invalid model plan: ${kind}`, async () => {
    const plan: any = {};
    const { s, d, g, e } = setup("学习", plan);
    try {
      const t = d.task({
        title: "原任务",
        goal: g.id,
        date: d.today(),
        minutes: 15,
      });
      const newTask = (ref: string, dependsOn: string[] = []) => ({
        ref,
        title: ref,
        goal: g.id,
        date: d.today(),
        minutes: 15,
        priority: "中",
        note: "",
        dependencies: [],
        dependsOn,
      });
      if (kind === "unknown move")
        plan.moves = [{ taskId: "unknown", date: d.today(), reason: "测试" }];
      if (kind === "done move") {
        d.updateTask(t.id, { status: "done" });
        plan.moves = [
          { taskId: t.id, date: addDay(d.today(), 1), reason: "测试" },
        ];
      }
      if (kind === "new task on reschedule") plan.tasks = [newTask("a")];
      if (kind === "duplicate reference")
        plan.tasks = [newTask("a"), newTask("a")];
      if (kind === "unknown reference")
        plan.tasks = [newTask("a", ["missing"])];
      if (kind === "cycle reference")
        plan.tasks = [newTask("a", ["b"]), newTask("b", ["a"])];
      const r = e.start({
        kind: kind === "new task on reschedule" ? "reschedule" : "plan",
        goal: g.id,
      });
      const result = await wait(e, r.id);
      assert.equal(result.status, "failed");
      assert.equal(s.list("proposal").length, 0);
      assert.equal(s.list("task").length, 1);
    } finally {
      await e.close();
      s.close();
    }
  });

test("reschedule applies existing records without duplication and rejects stale versions", async () => {
  const plan: any = {};
  const { s, d, g, e } = setup("学习", plan);
  try {
    const t = d.task({
      title: "原任务",
      goal: g.id,
      date: d.today(),
      minutes: 15,
    });
    plan.moves = [
      { taskId: t.id, date: addDay(d.today(), 1), reason: "调整时间" },
    ];
    const r = e.start({ kind: "reschedule" });
    const result = await wait(e, r.id);
    assert.equal(result.status, "pending");
    assert.equal(d.require("task", t.id).date, d.today());
    d.apply(result.proposal);
    d.apply(result.proposal);
    assert.equal(s.list("task").length, 1);
    assert.equal(d.require("task", t.id).date, addDay(d.today(), 1));
    const second = e.start({ kind: "reschedule" });
    const stale = await wait(e, second.id);
    d.energy(d.today(), "疲惫");
    assert.throws(() => d.apply(stale.proposal), /数据已变化/);
  } finally {
    await e.close();
    s.close();
  }
});

test("quiz answers protected, invalid submissions rejected, revision only once", async () => {
  const { s, d, g, e } = setup();
  try {
    const r = e.start({ kind: "quiz", goal: g.id });
    const done = await wait(e, r.id),
      q = d.require("quiz", done.quiz);
    assert.equal(done.status, "succeeded");
    assert.equal("correct" in d.publicQuiz(q).questions[0], false);
    assert.equal(JSON.stringify(e.get(r.id)).includes('"correct"'), false);
    for (const answers of [[], [0, 0], [0, 0, 4], [0, 0, -1], [0, 0, 1.5]])
      assert.throws(() => d.submitQuiz(q.id, answers));
    assert.throws(() => d.revision(q.id), /先完成|提交/);
    const result = d.submitQuiz(q.id, [1, 0, 1]);
    assert.equal(result.result.score, 2);
    assert.equal(d.submitQuiz(q.id, [1, 1, 1]).result.score, 2);
    const p = d.revision(q.id);
    d.apply(p.id);
    assert.equal(d.revision(q.id).id, p.id);
    assert.equal(s.list("task").length, 1);
    const review = e.start({ kind: "review", from: d.today(), to: d.today() });
    const rd = await wait(e, review.id);
    assert.equal(rd.status, "pending");
    assert.equal(s.list("review")[0].facts.completed, 0);
  } finally {
    await e.close();
    s.close();
  }
});
