// 覆盖 D06-D08/D10：编排交接、失败恢复、取消、答案隔离。
import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../apps/api/store";
import { Domain, addDay } from "../apps/api/domain";
import { Runs } from "../apps/api/runs";
import { agentInfo } from "../shared/contracts";
import type { ModelCall } from "../apps/api/model";
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 500; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error("condition timeout");
};
const wait = async (engine: Runs, id: string) => {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const r = engine.get(id);
    if (!["queued", "running"].includes(r.status)) return r;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run timeout");
};
const output = (role: string, context: any) => {
  if (role === "学习 Agent" && context.request.kind === "quiz")
    return {
      summary: "测验准备",
      questions: Array.from({ length: 3 }, (_, i) => ({
        question: "问题" + i,
        options: ["A", "B", "C", "D"],
        correct: 1,
        explanation: "解释",
        topic: "Hooks",
      })),
    };
  if (role === "协调 Agent")
    return { summary: "任务已分派", intent: "制定计划" };
  if (role === "学习 Agent")
    return {
      summary: "路线准备",
      stages: [{ title: "基础", description: "理解状态" }],
    };
  if (role === "生活 Agent")
    return { summary: "容量核对", constraints: ["每日120分钟"] };
  if (role === "计划 Agent")
    return {
      summary: "计划准备",
      reason: "按可用时间安排",
      tasks:
        context.request.kind === "reschedule"
          ? []
          : [
              {
                ref: "first",
                title: "学习 Hooks",
                goal: context.goal?.id || "",
                date: context.today,
                minutes: 30,
                priority: "中",
                note: "实践",
                dependencies: [],
                dependsOn: [],
              },
            ],
      moves: [],
    };
  return {
    summary: "复盘",
    analysis: "根据记录回顾",
    suggestions: ["继续实践"],
  };
};
test("real orchestration boundary uses structured upstream and applies only after confirmation", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store),
    g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
  let calls = 0;
  const model: ModelCall = async (role, schema, context) => {
    calls++;
    if (role === "计划 Agent")
      assert.equal(Object.keys((context as any).upstream).length, 3);
    return schema.parse(output(role, context));
  };
  const engine = new Runs(d, model);
  try {
    const run = engine.start({ kind: "plan", goal: g.id }),
      done = await wait(engine, run.id);
    assert.equal(done.status, "pending");
    assert.equal(calls, 5);
    assert.equal(store.list("task").length, 0);
    d.apply(done.proposal);
    assert.equal(store.list("task").length, 1);
    assert.equal(store.list("route").length, 1);
  } finally {
    await engine.close();
    store.close();
  }
});
test("failure retry preserves successful upstream nodes", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store),
    g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
  let failed = false,
    coordinator = 0;
  const model: ModelCall = async (role, schema, context) => {
    if (role === "协调 Agent") coordinator++;
    if (role === "计划 Agent" && !failed) {
      failed = true;
      throw new Error("simulated timeout");
    }
    return schema.parse(output(role, context));
  };
  const engine = new Runs(d, model);
  try {
    const run = engine.start({ kind: "plan", goal: g.id });
    assert.equal((await wait(engine, run.id)).status, "failed");
    engine.retry(run.id);
    assert.equal((await wait(engine, run.id)).status, "pending");
    assert.equal(coordinator, 1);
  } finally {
    await engine.close();
    store.close();
  }
});
test("cancelled asynchronous output cannot land a proposal", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store),
    g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
  const engine = new Runs(d, async (role, schema, context) => {
    await new Promise((r) => setTimeout(r, 30));
    return schema.parse(output(role, context));
  });
  try {
    const run = engine.start({ kind: "plan", goal: g.id });
    await new Promise((r) => setTimeout(r, 10));
    engine.cancel(run.id);
    await engine.close();
    assert.equal(engine.get(run.id).status, "cancelled");
    assert.equal(store.list("proposal").length, 0);
    assert.equal(d.require("goal", g.id).status, "draft");
  } finally {
    store.close();
  }
});

test("cancelling a queued run preserves cancellation before dispatch", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store);
  const g = d.goal({
    title: "React",
    type: "学习",
    deadline: addDay(d.today(), 7),
    minutes: 120,
  });
  let calls = 0;
  const engine = new Runs(d, async (role, schema, context) => {
    calls++;
    return schema.parse(output(role, context));
  });
  try {
    const r = engine.start({ kind: "plan", goal: g.id });
    engine.cancel(r.id);
    await engine.close();
    assert.equal(engine.get(r.id).status, "cancelled");
    assert.equal(calls, 0);
    assert.equal(store.list("proposal").length, 0);
  } finally {
    await engine.close();
    store.close();
  }
});
test("invalid final plan retry receives validation feedback and reuses upstream", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store),
    g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
  let plannerCalls = 0,
    coordinatorCalls = 0;
  const engine = new Runs(d, async (role, schema, context: any) => {
    if (role === "协调 Agent") coordinatorCalls++;
    const result = output(role, context);
    if (role === "计划 Agent") {
      plannerCalls++;
      if (plannerCalls === 1) (result as any).tasks[0].minutes = 200;
      else assert.match(context.validationFeedback, /可用时间|容量/);
    }
    return schema.parse(result);
  });
  try {
    const r = engine.start({ kind: "plan", goal: g.id });
    assert.equal((await wait(engine, r.id)).status, "failed");
    assert.equal(store.list("proposal").length, 0);
    engine.retry(r.id);
    assert.equal((await wait(engine, r.id)).status, "pending");
    assert.equal(coordinatorCalls, 1);
    assert.equal(plannerCalls, 2);
  } finally {
    await engine.close();
    store.close();
  }
});
test("quiz and review outputs are distinct and stats persist", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store),
    g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    }),
    engine = new Runs(d, async (role, schema, context) =>
      schema.parse(output(role, context)),
    );
  try {
    const qrun = engine.start({ kind: "quiz", goal: g.id }),
      result = await wait(engine, qrun.id);
    assert.equal(result.status, "succeeded");
    assert.equal(
      "correct" in d.publicQuiz(d.require("quiz", result.quiz)).questions[0],
      false,
    );
    assert.equal(
      "correct" in engine.get(qrun.id).nodes[1].output.questions[0],
      false,
    );
    assert.equal(
      "correct" in (d.state() as any).runs[0].nodes[1].output.questions[0],
      false,
    );
    const r = engine.start({ kind: "review", from: d.today(), to: d.today() });
    assert.equal((await wait(engine, r.id)).status, "pending");
    assert.equal(store.list("review")[0].facts.completed, 0);
  } finally {
    await engine.close();
    store.close();
  }
});

for (const kind of ["plan", "review", "reschedule"])
  test(`${kind}: analysis branches overlap and downstream waits for both`, async () => {
    const store = new Store(":memory:"),
      d = new Domain(store);
    const g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
    const learning = gate(),
      life = gate();
    const calls: string[] = [];
    const contexts: Record<string, any> = {};
    const engine = new Runs(d, async (role, schema, context: any) => {
      calls.push(role);
      contexts[role] = context.upstream;
      if (role === "学习 Agent") await learning.promise;
      if (role === "生活 Agent") await life.promise;
      return schema.parse(output(role, context));
    });
    try {
      const r = engine.start({ kind, goal: g.id });
      await until(
        () => calls.includes("学习 Agent") && calls.includes("生活 Agent"),
      );
      assert.equal(
        engine.get(r.id).nodes.filter((n: any) => n.status === "running")
          .length,
        2,
      );
      assert.deepEqual(Object.keys(contexts["学习 Agent"]), ["coordinator"]);
      assert.deepEqual(contexts["生活 Agent"], contexts["学习 Agent"]);
      learning.release();
      await until(
        () =>
          engine.get(r.id).nodes.find((n: any) => n.agent === "learning")
            .status === "succeeded",
      );
      assert.equal(calls.includes("计划 Agent"), false);
      assert.equal(calls.includes("复盘 Agent"), false);
      life.release();
      assert.equal((await wait(engine, r.id)).status, "pending");
      assert.ok(contexts["计划 Agent"].learning);
      assert.ok(contexts["计划 Agent"].life);
      assert.equal(calls.length, 5);
      if (kind === "review") assert.ok(contexts["计划 Agent"].review);
      else assert.ok(contexts["复盘 Agent"].planner);
      assert.equal(store.list("task").length, 0);
    } finally {
      learning.release();
      life.release();
      await engine.close();
      store.close();
    }
  });

for (const failBoth of [false, true])
  test(`parallel failure settles siblings and retry preserves successes (both=${failBoth})`, async () => {
    const store = new Store(":memory:"),
      d = new Domain(store);
    const g = d.goal({
      title: "React",
      type: "学习",
      deadline: addDay(d.today(), 7),
      minutes: 120,
    });
    const sibling = gate();
    let first = true;
    const calls: Record<string, number> = {};
    const engine = new Runs(d, async (role, schema, context) => {
      calls[role] = (calls[role] || 0) + 1;
      if (first && role === "学习 Agent") throw Error("branch failed");
      if (first && role === "生活 Agent") {
        await sibling.promise;
        if (failBoth) throw Error("sibling failed");
      }
      return schema.parse(output(role, context));
    });
    try {
      const r = engine.start({ kind: "plan", goal: g.id });
      await until(
        () =>
          engine.get(r.id).nodes.find((n: any) => n.agent === "learning")
            .status === "failed",
      );
      assert.equal(engine.get(r.id).status, "running");
      assert.throws(
        () => engine.start({ kind: "plan", goal: g.id }),
        /正在运行/,
      );
      assert.equal(calls["计划 Agent"], undefined);
      sibling.release();
      const failed = await wait(engine, r.id);
      assert.equal(failed.status, "failed");
      assert.equal(
        failed.nodes.find((n: any) => n.agent === "life").status,
        failBoth ? "failed" : "succeeded",
      );
      assert.equal(store.list("proposal").length, 0);
      first = false;
      engine.retry(r.id);
      assert.equal((await wait(engine, r.id)).status, "pending");
      assert.equal(calls["协调 Agent"], 1);
      assert.equal(calls["学习 Agent"], 2);
      assert.equal(calls["生活 Agent"], failBoth ? 2 : 1);
    } finally {
      sibling.release();
      await engine.close();
      store.close();
    }
  });

test("cancel during parallel analysis blocks both late results and downstream", async () => {
  const store = new Store(":memory:"),
    d = new Domain(store);
  const g = d.goal({
    title: "React",
    type: "学习",
    deadline: addDay(d.today(), 7),
    minutes: 120,
  });
  const release = gate();
  const signals: AbortSignal[] = [];
  const calls: string[] = [];
  const engine = new Runs(d, async (role, schema, context, signal) => {
    calls.push(role);
    if (["学习 Agent", "生活 Agent"].includes(role)) {
      signals.push(signal);
      await release.promise;
    }
    return schema.parse(output(role, context));
  });
  try {
    const r = engine.start({ kind: "plan", goal: g.id });
    await until(() => signals.length === 2);
    engine.cancel(r.id);
    assert.ok(signals.every((signal) => signal.aborted));
    release.release();
    await engine.close();
    assert.equal(engine.get(r.id).status, "cancelled");
    assert.equal(engine.get(r.id).nodes.filter((n: any) => n.output).length, 1);
    assert.equal(calls.includes("计划 Agent"), false);
    assert.equal(store.list("proposal").length, 0);
    assert.equal(d.require("goal", g.id).status, "draft");
  } finally {
    release.release();
    await engine.close();
    store.close();
  }
});
