// 覆盖 F02/F04/F06, R01/R07：真实编排、上下文、产出持久化与恢复。
import { randomUUID } from "node:crypto";
import {
  runInput,
  schemas,
  agentInfo,
  runStages,
  type AgentId,
} from "../../shared/contracts";
import { Domain, DomainError, fail, addDay } from "./domain";
import { callDeepSeek, type ModelCall } from "./model";
import type { Row } from "./store";
import { config } from "./config";
export class Runs {
  controllers = new Map<string, AbortController>();
  constructor(
    public d: Domain,
    public model: ModelCall = callDeepSeek,
  ) {
    for (const r of d.store.list("run"))
      if (["running", "queued"].includes(r.status)) {
        d.store.put(
          "run",
          { ...r, status: "failed", error: "服务重启中断了运行，可重试" },
          r.id,
        );
        this.restoreGoal(r);
      }
  }
  restoreGoal(r: Row) {
    if (r.goal) {
      const g = this.d.store.get("goal", r.goal);
      if (g && ["planning", "pending"].includes(g.status))
        this.d.store.put(
          "goal",
          {
            ...g,
            status: this.d.store.list("task").some((t) => t.goal === g.id)
              ? "active"
              : "draft",
          },
          g.id,
        );
    }
  }
  start(body: unknown) {
    const input = runInput.parse(body),
      settings = this.d.settings();
    let goal: Row | undefined;
    if (input.goal) {
      goal = this.d.require("goal", input.goal);
      if (["completed", "archived"].includes(goal.status))
        fail("目标已经完成或归档");
    }
    if (["plan", "quiz"].includes(input.kind) && !goal)
      fail("请选择一个目标", 400);
    if (input.kind === "quiz" && goal?.type !== "学习")
      fail("测验需要学习目标", 400);
    const required =
      input.kind === "quiz"
        ? ["coordinator", "learning"]
        : input.kind === "review"
          ? ["coordinator", "review", "planner"]
          : [
              "coordinator",
              "planner",
              goal?.type === "生活" ? "life" : "learning",
            ];
    if (input.kind === "reschedule") required.push("life");
    if (required.some((id) => !settings.agents[id as AgentId]))
      fail("请启用本次协作必需的 Agent");
    if (
      this.d.store
        .list("run")
        .some((r) => ["queued", "running"].includes(r.status))
    )
      fail("已有协作正在运行，请完成或取消后再发起");
    const from = input.from || this.d.today(),
      to = input.to || this.d.today();
    if (
      from > to ||
      new Date(to).getTime() - new Date(from).getTime() > 90 * 86400000
    )
      fail("复盘范围无效", 400);
    const context = {
      goals: this.d.store
        .list("goal")
        .filter((g) => !["completed", "archived"].includes(g.status))
        .map(({ id, title, deadline, minutes }) => ({
          id,
          title,
          deadline,
          minutes,
        })),
      request: input,
      today: this.d.today(),
      goal,
      settings,
      tasks: this.d.store
        .list("task")
        .map(
          ({
            id,
            title,
            goal,
            date,
            minutes,
            priority,
            status,
            dependencies,
          }) => ({
            id,
            title,
            goal,
            date,
            minutes,
            priority,
            status,
            dependencies,
          }),
        ),
      notes: goal
        ? this.d.store
            .list("note")
            .filter((n) => n.goal === goal.id)
            .map(({ title, body }) => ({ title, body }))
        : [],
      route: goal
        ? this.d.store
            .list("route")
            .filter((r) => r.goal === goal.id)
            .at(-1)?.stages
        : undefined,
      energy: this.d.store.get("energy", this.d.today()),
      habits: this.d.store.list("habit"),
      checkins: this.d.store
        .list("checkin")
        .filter((c) => c.date >= addDay(this.d.today(), -7)),
      quizzes: this.d.store
        .list("quiz")
        .filter(
          (q) => (input.kind === "review" || q.goal === input.goal) && q.result,
        )
        .map((q) => ({ result: q.result, weaknesses: q.weaknesses })),
      facts: this.d.stats(from, to),
    };
    const order = runStages(input.kind).flat();
    const r = this.d.store.put("run", {
      ...input,
      from,
      to,
      status: "queued",
      title: goal?.title || (input.kind === "review" ? "执行复盘" : "日程调整"),
      baseVersion: this.d.store.version(),
      configSnapshot: settings.agents,
      modelSnapshot: { provider: "deepseek", model: config.model },
      context,
      orchestration: "parallel-v1",
      nodes: order.map((agent) => ({ agent, status: "waiting" })),
    });
    if (goal && input.kind === "plan")
      this.d.store.put("goal", { ...goal, status: "planning" }, goal.id);
    this.d.activity(`发起协作：${r.title}`);
    this.launch(r.id);
    return this.public(r);
  }
  public(r: Row): Row {
    return this.d.publicRun(r);
  }
  get(id: string) {
    return this.public(this.d.require("run", id));
  }
  launch(id: string) {
    const controller = new AbortController();
    this.controllers.set(id, controller);
    setTimeout(() => void this.execute(id, controller), 0);
  }
  async execute(id: string, controller: AbortController) {
    let r = this.d.require("run", id);
    try {
      controller.signal.throwIfAborted();
      r = this.d.store.put("run", { ...r, status: "running", error: null }, id);
      for (const stage of runStages(r.kind)) {
        controller.signal.throwIfAborted();
        r = this.d.require("run", id);
        // 同阶段共享同一份上游快照，避免完成先后影响输入。
        const upstream = Object.fromEntries(
          r.nodes
            .filter(
              (n: any) => n.status === "succeeded" && !stage.includes(n.agent),
            )
            .map((n: any) => [n.agent, n.output]),
        );
        // 等待所有并行调用收尾，保留成功分支并阻止失败后的下游调度。
        const results = await Promise.allSettled(
          stage.map((agent) =>
            this.executeNode(id, agent, upstream, controller),
          ),
        );
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        controller.signal.throwIfAborted();
      }
      r = this.d.require("run", id);
      this.finalize(r);
      this.d.activity(`协作完成：${r.title}`);
    } catch (e) {
      r = this.d.require("run", id);
      if (r.status !== "cancelled") {
        const message =
          e instanceof DomainError
            ? e.message
            : controller.signal.aborted
              ? "运行已中断"
              : "节点执行失败，可重试";
        // 节点失败已由各分支记录；最终业务校验失败则重做计划及其下游。
        if (!r.nodes.some((n: any) => n.status === "failed")) {
          const n = r.nodes.find((n: any) => n.agent === "planner");
          if (n) {
            n.status = "failed";
            n.error = message;
            const stages = runStages(r.kind);
            const downstream = stages
              .slice(stages.findIndex((s) => s.includes("planner")) + 1)
              .flat();
            r.nodes = r.nodes.map((node: any) => {
              return downstream.includes(node.agent)
                ? { agent: node.agent, status: "waiting" }
                : node;
            });
          }
        }
        this.d.store.put("run", { ...r, status: "failed", error: message }, id);
        this.restoreGoal(r);
      }
    } finally {
      this.controllers.delete(id);
    }
  }
  async executeNode(
    id: string,
    agent: AgentId,
    upstream: Record<string, any>,
    controller: AbortController,
  ) {
    controller.signal.throwIfAborted();
    let r = this.d.require("run", id);
    const node = r.nodes.find((n: any) => n.agent === agent);
    if (!node || ["succeeded", "skipped"].includes(node.status)) return;
    if (!r.configSnapshot[agent]) {
      node.status = "skipped";
      node.summary = "该角色已暂停";
      this.d.store.put("run", r, id);
      return;
    }
    node.status = "running";
    node.startedAt = new Date().toISOString();
    this.d.store.put("run", r, id);
    const schema =
      r.kind === "quiz" && agent === "learning" ? schemas.quiz : schemas[agent];
    try {
      const output = schema.parse(
        await this.model(
          agentInfo.find((a) => a.id === agent)!.name,
          schema,
          { ...r.context, upstream, validationFeedback: r.lastFailure },
          controller.signal,
        ),
      );
      controller.signal.throwIfAborted();
      // 每次写入读取最新记录，避免并发分支互相覆盖节点状态。
      r = this.d.require("run", id);
      if (r.status === "cancelled") return;
      const current = r.nodes.find((n: any) => n.agent === agent);
      Object.assign(current, {
        status: "succeeded",
        output,
        summary: output.summary,
        finishedAt: new Date().toISOString(),
      });
      this.d.store.put("run", r, id);
    } catch (e) {
      r = this.d.require("run", id);
      if (r.status !== "cancelled") {
        const current = r.nodes.find((n: any) => n.agent === agent);
        Object.assign(current, {
          status: "failed",
          error: e instanceof DomainError ? e.message : "节点执行失败，可重试",
          finishedAt: new Date().toISOString(),
        });
        this.d.store.put("run", r, id);
      }
      throw e;
    }
  }
  finalize(r: Row) {
    const output = (id: string) =>
      r.nodes.find((n: any) => n.agent === id)?.output;
    this.d.store.transaction(() => {
      if (r.kind === "quiz") {
        const q = this.d.store.put("quiz", {
          goal: r.goal,
          run: r.id,
          ...output("learning"),
        });
        this.d.store.put(
          "run",
          { ...r, status: "succeeded", quiz: q.id },
          r.id,
        );
        return;
      }
      const plan = output("planner");
      if (!plan) fail("计划节点未提供有效产出");
      const refs = new Map<string, string>();
      plan.tasks.forEach((t: any) => {
        if (refs.has(t.ref)) fail("模型产出包含重复任务引用");
        refs.set(t.ref, randomUUID());
      });
      const tasks = plan.tasks.map((t: any) => {
        const { ref, dependsOn, ...fields } = t;
        return {
          ...fields,
          goal: r.goal || fields.goal || "",
          taskId: refs.get(ref),
          dependencies: [
            ...(fields.dependencies || []),
            ...(dependsOn || []).map((d: string) => {
              if (!refs.has(d)) fail("模型任务依赖引用无效");
              return refs.get(d);
            }),
          ],
        };
      });
      const all = this.d.store.list("task"),
        moves = plan.moves.map((m: any) => ({
          ...m,
          beforeDate: all.find((t) => t.id === m.taskId)?.date,
        }));
      if (r.kind === "reschedule" && tasks.length)
        fail("重新排期不能创建重复任务");
      const updated = all.map((t) => {
        const m = moves.find((m: any) => m.taskId === t.id);
        if (!m) return t;
        if (t.status === "done") fail("模型尝试调整已完成任务");
        return { ...t, date: m.date };
      });
      if (moves.some((m: any) => !all.some((t) => t.id === m.taskId)))
        fail("模型引用了不存在的任务");
      if (
        r.kind === "reschedule" &&
        r.goal &&
        moves.some(
          (m: any) => all.find((t) => t.id === m.taskId)?.goal !== r.goal,
        )
      )
        fail("模型尝试调整所选目标以外的任务");
      this.d.validateTasks([
        ...updated,
        ...tasks.map((t: any) => ({ ...t, id: t.taskId, status: "todo" })),
      ]);
      const p = this.d.store.put("proposal", {
        run: r.id,
        goal: r.goal,
        baseVersion: r.baseVersion,
        status: "pending",
        reason: plan.reason,
        tasks,
        moves,
        source: r.kind === "review" ? "复盘 Agent" : "计划 Agent",
      });
      if (r.kind === "plan" && output("learning")?.stages)
        this.d.store.put("route", {
          goal: r.goal,
          run: r.id,
          stages: output("learning").stages,
        });
      if (r.kind === "review")
        this.d.store.put("review", {
          run: r.id,
          from: r.from,
          to: r.to,
          facts: r.context.facts,
          ...output("review"),
          proposal: p.id,
        });
      this.d.store.put(
        "run",
        { ...r, status: "pending", proposal: p.id },
        r.id,
      );
      if (r.goal && r.kind === "plan") {
        const g = this.d.require("goal", r.goal);
        this.d.store.put("goal", { ...g, status: "pending" }, g.id);
      }
    });
  }
  retry(id: string) {
    const r = this.d.require("run", id);
    if (r.status !== "failed") fail("仅失败运行可以重试");
    if (
      this.controllers.size ||
      this.d.store
        .list("run")
        .some((r) => ["running", "queued"].includes(r.status))
    )
      fail("已有运行正在执行");
    this.d.store.put(
      "run",
      {
        ...r,
        status: "queued",
        lastFailure: r.error,
        orchestration: "parallel-v1",
        error: null,
        nodes: r.nodes.map((n: any) =>
          n.status === "failed" || n.status === "running"
            ? { agent: n.agent, status: "waiting" }
            : n,
        ),
      },
      id,
    );
    this.launch(id);
    return this.get(id);
  }
  cancel(id: string) {
    const r = this.d.require("run", id);
    if (!["queued", "running"].includes(r.status)) fail("该运行当前不能取消");
    this.d.store.put("run", { ...r, status: "cancelled" }, id);
    this.controllers.get(id)?.abort();
    this.restoreGoal(r);
    return this.get(id);
  }
  async close() {
    for (const controller of this.controllers.values()) controller.abort();
    while (this.controllers.size) await new Promise((r) => setTimeout(r, 10));
  }
}
