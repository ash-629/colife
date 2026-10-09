// 覆盖 F01/F03/F04/F05/F06, R01-R06：确定性业务规则与统计。
import {
  goalInput,
  taskInput,
  habitInput,
  noteInput,
  resourceInput,
  settingsInput,
  agentIds,
  type Settings,
} from "../../shared/contracts";
import { Store, type Row } from "./store";
import { randomUUID } from "node:crypto";
export class DomainError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "BUSINESS_ERROR",
  ) {
    super(message);
  }
}
export function fail(message: string, status = 409): never {
  throw new DomainError(status, message);
}
export function day(timezone = "Asia/Shanghai", time = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function addDay(d: string, n: number) {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export class Domain {
  constructor(public store: Store) {
    if (!store.get("settings", "personal"))
      store.put(
        "settings",
        {
          timezone: "Asia/Shanghai",
          dailyMinutes: 120,
          fixed: [],
          agents: Object.fromEntries(agentIds.map((a) => [a, true])),
        },
        "personal",
      );
  }
  settings() {
    return this.store.get("settings", "personal") as Row & Settings;
  }
  today() {
    return day(this.settings().timezone);
  }
  require(kind: string, id: string) {
    const row = this.store.get(kind, id);
    if (!row) fail("记录不存在", 404);
    return row;
  }
  activity(text: string) {
    this.store.put("activity", { text, time: new Date().toISOString() });
    const rows = this.store.list("activity");
    rows
      .slice(0, Math.max(0, rows.length - 100))
      .forEach((r) => this.store.delete("activity", r.id));
  }
  goal(body: unknown) {
    const input = goalInput.parse(body);
    if (input.deadline < this.today()) fail("截止日期不能早于今天", 400);
    const row = this.store.put("goal", { ...input, status: "draft" });
    this.store.bump();
    this.activity(`创建目标：${row.title}`);
    return row;
  }
  updateGoal(id: string, body: Record<string, unknown>) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail("请提交有效的目标对象", 400);
    const old = this.require("goal", id),
      input = goalInput.parse({
        ...Object.fromEntries(
          Object.keys(goalInput.shape).map((k) => [k, old[k]]),
        ),
        ...Object.fromEntries(
          Object.entries(body).filter(([k]) => k !== "status"),
        ),
      });
    const status = body.status === undefined ? old.status : body.status;
    if (!["draft", "active", "completed", "archived"].includes(String(status)))
      fail("目标状态无效", 400);
    if (status === "completed" && !String(input.criteria).trim())
      fail("请先明确验收标准");
    if (
      status === "completed" &&
      this.store.list("task").some((t) => t.goal === id && t.status !== "done")
    )
      fail("请先完成关联任务再验收目标");
    if (
      this.store
        .list("task")
        .some((t) => t.goal === id && t.date > input.deadline)
    )
      fail("新的截止日期早于关联任务");
    if (input.deadline !== old.deadline && input.deadline < this.today())
      fail("截止日期不能早于今天", 400);
    this.validateTasks(
      this.store.list("task"),
      this.store
        .list("goal")
        .map((g) => (g.id === id ? { ...g, ...input } : g)),
    );
    const row = this.store.put("goal", { ...old, ...input, status }, id);
    this.store.bump();
    this.activity(`更新目标：${row.title}`);
    return row;
  }
  validateTasks(tasks: Row[], goals = this.store.list("goal")) {
    const settings = this.settings(),
      map = new Map(tasks.map((t) => [t.id, t])),
      capacity = new Map<string, number>(),
      perGoal = new Map<string, number>();
    for (const t of tasks) {
      if (t.goal) {
        const g = goals.find((g) => g.id === t.goal);
        if (!g) fail("任务关联目标不存在", 400);
        if (t.date > g.deadline) fail(`任务“${t.title}”超过目标截止日期`);
        const key = t.goal + ":" + t.date;
        perGoal.set(key, (perGoal.get(key) || 0) + t.minutes);
        if (perGoal.get(key)! > g.minutes)
          fail(`目标“${g.title}”在 ${t.date} 超出每日可用时间`);
      }
      capacity.set(t.date, (capacity.get(t.date) || 0) + t.minutes);
      for (const dep of t.dependencies || []) {
        const parent = map.get(dep);
        if (!parent) fail("依赖任务不存在", 400);
        if (parent.date > t.date) fail("任务安排早于依赖任务");
        if (t.status !== "todo" && parent.status !== "done")
          fail("依赖任务未完成，不能开始或完成当前任务");
      }
    }
    for (const fixed of settings.fixed)
      if (!capacity.has(fixed.date)) capacity.set(fixed.date, 0);
    for (const [date, minutes] of capacity) {
      const reserved = settings.fixed
        .filter((f) => f.date === date)
        .reduce((s, f) => s + f.minutes, 0);
      if (minutes + reserved > settings.dailyMinutes)
        fail(
          `${date} 的任务与固定安排超过每日 ${settings.dailyMinutes} 分钟容量`,
        );
    }
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const dfs = (id: string) => {
      if (visiting.has(id)) fail("任务依赖不能形成循环");
      if (visited.has(id)) return;
      visiting.add(id);
      for (const d of map.get(id)?.dependencies || []) dfs(d);
      visiting.delete(id);
      visited.add(id);
    };
    tasks.forEach((t) => dfs(t.id));
  }
  task(body: unknown, source = "手动创建") {
    const input = taskInput.parse(body),
      now = new Date().toISOString(),
      row = {
        ...input,
        id: randomUUID(),
        status: "todo",
        source,
        createdAt: now,
        updatedAt: now,
      };
    this.validateTasks([...this.store.list("task"), row]);
    this.store.put("task", row);
    this.store.bump();
    this.activity(`添加任务：${row.title}`);
    return row;
  }
  updateTask(id: string, body: Record<string, unknown>) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail("请提交有效的任务对象", 400);
    const old = this.require("task", id);
    if (
      Object.keys(body).some(
        (k) => !Object.keys(taskInput.shape).includes(k) && k !== "status",
      )
    )
      fail("任务字段无效", 400);
    const input = taskInput.parse({
      ...Object.fromEntries(
        Object.keys(taskInput.shape).map((k) => [k, old[k]]),
      ),
      ...Object.fromEntries(
        Object.entries(body).filter(([k]) => k !== "status"),
      ),
    });
    const status = body.status === undefined ? old.status : body.status;
    if (!["todo", "doing", "done"].includes(String(status)))
      fail("状态无效", 400);
    if (
      old.status === "done" &&
      (input.date !== old.date ||
        JSON.stringify(input.dependencies) !== JSON.stringify(old.dependencies))
    )
      fail("已完成任务不能重新排期或更改依赖");
    const row = {
      ...old,
      ...input,
      status,
      completedAt:
        status === "done" ? old.completedAt || new Date().toISOString() : null,
    };
    this.validateTasks(
      this.store.list("task").map((t) => (t.id === id ? row : t)),
    );
    this.store.put("task", row, id);
    this.store.bump();
    this.activity(`任务${status === "done" ? "完成" : "更新"}：${row.title}`);
    return row;
  }
  deleteTask(id: string) {
    const t = this.require("task", id);
    if (t.status === "done") fail("请先恢复任务，再删除");
    if (
      this.store.list("task").some((t) => (t.dependencies || []).includes(id))
    )
      fail("任务仍被其他任务依赖");
    this.store.delete("task", id);
    this.store.bump();
  }
  updateSettings(body: unknown) {
    const input = settingsInput.parse(body),
      old = this.settings();
    return this.store.transaction(() => {
      this.store.put("settings", { ...old, ...input }, "personal");
      this.validateTasks(this.store.list("task"));
      this.store.bump();
      return this.settings();
    });
  }
  habit(body: unknown) {
    return this.store.put("habit", habitInput.parse(body));
  }
  checkin(id: string, date: string, on: boolean) {
    this.require("habit", id);
    if (date > this.today()) fail("不能提前记录未来打卡", 400);
    const key = id + ":" + date;
    if (on) {
      this.store.put("checkin", { habit: id, date }, key);
      this.activity("习惯已打卡");
    } else this.store.delete("checkin", key);
    return { ok: true };
  }
  energy(date: string, value: string) {
    if (date > this.today()) fail("不能记录未来精力", 400);
    const row = this.store.put("energy", { date, value }, date);
    this.store.bump();
    return row;
  }
  note(body: unknown, id?: string) {
    const input = noteInput.parse(body);
    if (input.goal) this.require("goal", input.goal);
    return this.store.put(
      "note",
      { ...(id ? this.require("note", id) : {}), ...input },
      id,
    );
  }
  resource(body: unknown) {
    const input = resourceInput.parse(body);
    this.require("goal", input.goal);
    return this.store.put("resource", input);
  }
  focus(task: string) {
    const target = this.require("task", task);
    if (
      (target.dependencies || []).some(
        (id: string) => this.require("task", id).status !== "done",
      )
    )
      fail("依赖任务未完成，不能开始当前任务的专注");
    if (this.store.list("focus").some((f) => f.status !== "finished"))
      fail("已有未结束的专注记录");
    return this.store.put("focus", {
      task,
      status: "running",
      startedAt: Date.now(),
      resumedAt: Date.now(),
      elapsedSeconds: 0,
      date: this.today(),
    });
  }
  focusAction(id: string, action: string) {
    const f = this.require("focus", id);
    if (f.status === "finished") return f;
    const now = Date.now();
    if (f.status === "running")
      f.elapsedSeconds = Math.min(
        1500,
        f.elapsedSeconds + Math.max(0, Math.floor((now - f.resumedAt) / 1000)),
      );
    if (action === "pause") {
      f.status = "paused";
    } else if (action === "resume") {
      f.status = "running";
      f.resumedAt = now;
    } else {
      f.status = "finished";
      f.finishedAt = new Date().toISOString();
      this.activity(`记录专注 ${Math.floor(f.elapsedSeconds / 60)} 分钟`);
    }
    return this.store.put("focus", f, id);
  }
  stats(from: string, to: string) {
    const all = this.store.list("task"),
      scheduled = all.filter((t) => t.date >= from && t.date <= to),
      completed = all.filter(
        (t) =>
          t.completedAt &&
          day(this.settings().timezone, new Date(t.completedAt)) >= from &&
          day(this.settings().timezone, new Date(t.completedAt)) <= to,
      ),
      focus = this.store
        .list("focus")
        .filter(
          (f) => f.status === "finished" && f.date >= from && f.date <= to,
        ),
      checks = this.store
        .list("checkin")
        .filter((c) => c.date >= from && c.date <= to);
    const trend = [];
    for (let d = from; d <= to; d = addDay(d, 1)) {
      trend.push({
        date: d,
        focusMinutes: Math.floor(
          focus
            .filter((f) => f.date === d)
            .reduce((s, f) => s + f.elapsedSeconds, 0) / 60,
        ),
        completed: completed.filter(
          (t) => day(this.settings().timezone, new Date(t.completedAt)) === d,
        ).length,
        checkins: checks.filter((c) => c.date === d).length,
      });
    }
    return {
      from,
      to,
      scheduled: scheduled.length,
      scheduledDone: scheduled.filter((t) => t.status === "done").length,
      completionRate: scheduled.length
        ? Math.round(
            (scheduled.filter((t) => t.status === "done").length /
              scheduled.length) *
              100,
          )
        : 0,
      completed: completed.length,
      plannedMinutes: scheduled.reduce((s, t) => s + t.minutes, 0),
      focusMinutes: Math.floor(
        focus.reduce((s, f) => s + f.elapsedSeconds, 0) / 60,
      ),
      checkins: checks.length,
      trend,
    };
  }
  state() {
    const kinds = [
      "goal",
      "task",
      "habit",
      "checkin",
      "energy",
      "focus",
      "note",
      "resource",
      "route",
      "quiz",
      "run",
      "proposal",
      "review",
      "activity",
    ];
    return {
      today: this.today(),
      settings: this.settings(),
      version: this.store.version(),
      modelConfigured: false,
      ...Object.fromEntries(
        kinds.map((k) => [
          {
            energy: "energies",
            activity: "activities",
            focus: "focuses",
            quiz: "quizzes",
          }[k] || k + "s",
          this.store
            .list(k)
            .map((r) =>
              k === "quiz"
                ? this.publicQuiz(r)
                : k === "run"
                  ? this.publicRun(r)
                  : r,
            ),
        ]),
      ),
    };
  }
  publicQuiz(q: Row): Row {
    return {
      ...q,
      questions: q.questions.map((x: Record<string, any>) =>
        q.result
          ? x
          : { question: x.question, options: x.options, topic: x.topic },
      ),
    };
  }
  publicRun(r: Row): Row {
    const submitted = r.quiz && this.store.get("quiz", r.quiz)?.result;
    return {
      ...r,
      context: undefined,
      nodes: (r.nodes || []).map((n: any) =>
        r.kind === "quiz" && !submitted && n.output?.questions
          ? {
              ...n,
              output: {
                ...n.output,
                questions: n.output.questions.map(
                  ({ correct, explanation, ...question }: any) => question,
                ),
              },
            }
          : n,
      ),
    };
  }
  apply(id: string) {
    return this.store.transaction(() => {
      const p = this.require("proposal", id);
      if (p.status === "applied") return p;
      if (p.status !== "pending") fail("提案当前不可应用");
      if (p.baseVersion !== this.store.version())
        fail("计划数据已变化，请重新生成提案");
      const all = this.store.list("task");
      const updated = all.map((t) => {
        const move = (p.moves || []).find((m: any) => m.taskId === t.id);
        if (!move) return t;
        if (t.status === "done") fail("已完成任务不能重新排期");
        return { ...t, date: move.date };
      });
      for (const move of p.moves || [])
        if (!all.some((t) => t.id === move.taskId)) fail("待调整任务已不存在");
      const tasks = (p.tasks || []).map((t: any) =>
        (() => {
          const { taskId, ...input } = t;
          return {
            ...taskInput.parse(input),
            id: taskId || randomUUID(),
            status: "todo",
            source: p.source || "计划 Agent",
          };
        })(),
      );
      this.validateTasks([...updated, ...tasks]);
      updated.forEach((t) => this.store.put("task", t, t.id));
      tasks.forEach((t: any) => this.store.put("task", t, t.id));
      if (p.goal && this.store.get("goal", p.goal)) {
        const g = this.require("goal", p.goal);
        if (!["completed", "archived"].includes(g.status))
          this.store.put("goal", { ...g, status: "active" }, g.id);
      }
      this.store.put(
        "proposal",
        { ...p, status: "applied", appliedAt: new Date().toISOString() },
        id,
      );
      if (p.run) {
        const r = this.require("run", p.run);
        this.store.put("run", { ...r, status: "applied" }, r.id);
      }
      this.store.bump();
      this.activity("已确认并应用计划提案");
      return this.require("proposal", id);
    });
  }
  reject(id: string) {
    const p = this.require("proposal", id);
    if (p.status === "applied") fail("已应用的提案不能拒绝");
    this.store.put("proposal", { ...p, status: "rejected" }, id);
    if (p.run) {
      const r = this.require("run", p.run);
      this.store.put("run", { ...r, status: "rejected" }, r.id);
    }
    if (p.goal) {
      const g = this.require("goal", p.goal);
      if (g.status === "pending")
        this.store.put(
          "goal",
          {
            ...g,
            status: this.store.list("task").some((t) => t.goal === g.id)
              ? "active"
              : "draft",
          },
          g.id,
        );
    }
    return { ok: true };
  }
  submitQuiz(id: string, answers: number[]) {
    const q = this.require("quiz", id);
    if (q.result) return this.publicQuiz(q);
    if (
      answers.length !== q.questions.length ||
      answers.some(
        (a, i) =>
          !Number.isInteger(a) || a < 0 || a >= q.questions[i].options.length,
      )
    )
      fail("请完成所有题目", 400);
    const score = answers.filter((a, i) => a === q.questions[i].correct).length,
      weaknesses = q.questions
        .filter((_: any, i: number) => answers[i] !== q.questions[i].correct)
        .map((x: any) => x.topic);
    return this.publicQuiz(
      this.store.put(
        "quiz",
        { ...q, answers, result: { score, total: answers.length }, weaknesses },
        id,
      ),
    );
  }
  revision(id: string) {
    const q = this.require("quiz", id);
    if (!q.result) fail("请先提交测验");
    const previous = q.proposal
      ? this.require("proposal", q.proposal)
      : undefined;
    if (
      previous &&
      (previous.status === "applied" ||
        (previous.status === "pending" &&
          previous.baseVersion === this.store.version()))
    )
      return previous;
    if (q.result.score === q.result.total)
      fail("本次测验全部正确，无需薄弱点复习");
    const goal = this.require("goal", q.goal);
    if (["completed", "archived"].includes(goal.status))
      fail("目标已经完成或归档");
    let date = addDay(this.today(), 1);
    const tasks = this.store.list("task"),
      settings = this.settings();
    while (date <= goal.deadline) {
      const same = tasks.filter((t) => t.date === date);
      const total =
        same.reduce((s, t) => s + t.minutes, 0) +
        settings.fixed
          .filter((f) => f.date === date)
          .reduce((s, f) => s + f.minutes, 0);
      const own = same
        .filter((t) => t.goal === q.goal)
        .reduce((s, t) => s + t.minutes, 0);
      if (total + 25 <= settings.dailyMinutes && own + 25 <= goal.minutes)
        break;
      date = addDay(date, 1);
    }
    if (date > goal.deadline) fail("截止日期前没有可用的25分钟，请先调整日程");
    const p = this.store.put(
      "proposal",
      {
        quiz: q.id,
        goal: q.goal,
        baseVersion: this.store.version(),
        status: "pending",
        reason: `复习薄弱点：${q.weaknesses.join("、")}`,
        source: "学习 Agent",
        tasks: [
          {
            title: "复习：" + q.weaknesses.join("、").slice(0, 65),
            goal: q.goal,
            date,
            minutes: 25,
            priority: "高",
            note: "来源：已提交的知识测验",
            dependencies: [],
          },
        ],
        moves: [],
      },
      previous?.id,
    );
    this.store.put("quiz", { ...q, proposal: p.id }, id);
    return p;
  }
}
