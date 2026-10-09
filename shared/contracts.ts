// 覆盖 F01-F07, R01-R09：输入与模型输出契约。
import { z } from "zod";
export const text = (n: number) => z.string().trim().min(1).max(n);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    try {
      return new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
    } catch {
      return false;
    }
  }, "日期无效");
export const goalInput = z
  .object({
    title: text(60),
    type: z.enum(["学习", "生活"]),
    deadline: date,
    minutes: z.number().int().min(15).max(480),
    criteria: z.string().trim().max(300).default(""),
    context: z.string().trim().max(500).default(""),
  })
  .strict();
export const taskInput = z
  .object({
    title: text(80),
    goal: z.string().default(""),
    date,
    minutes: z.number().int().min(1).max(480),
    priority: z.enum(["高", "中", "低"]).default("中"),
    note: z.string().max(2000).default(""),
    dependencies: z.array(z.string()).max(30).default([]),
  })
  .strict();
export const habitInput = z
  .object({ name: text(30), target: text(60) })
  .strict();
export const noteInput = z
  .object({ goal: z.string().default(""), title: text(60), body: text(2000) })
  .strict();
export const resourceInput = z
  .object({
    goal: z.string(),
    title: text(100),
    url: z
      .string()
      .url()
      .refine((s) => /^https?:\/\//.test(s)),
    description: z.string().max(500).default(""),
  })
  .strict();
export const agentIds = [
  "coordinator",
  "learning",
  "life",
  "planner",
  "review",
] as const;
export type AgentId = (typeof agentIds)[number];
// F02 / R07：同阶段角色并行，后续阶段等待完整上游。
export const runStages = (kind: string): AgentId[][] =>
  kind === "quiz"
    ? [["coordinator"], ["learning"]]
    : kind === "review"
      ? [["coordinator"], ["learning", "life"], ["review"], ["planner"]]
      : [["coordinator"], ["learning", "life"], ["planner"], ["review"]];
export const settingsInput = z
  .object({
    timezone: z.string().refine((t) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: t });
        return true;
      } catch {
        return false;
      }
    }, "时区无效"),
    dailyMinutes: z.number().int().min(15).max(960),
    fixed: z
      .array(
        z.object({
          id: z.string(),
          title: text(60),
          date,
          minutes: z.number().int().min(1).max(960),
        }),
      )
      .max(100),
    agents: z.object({
      coordinator: z.boolean(),
      learning: z.boolean(),
      life: z.boolean(),
      planner: z.boolean(),
      review: z.boolean(),
    }),
  })
  .strict();
export type Settings = z.infer<typeof settingsInput>;
export type Goal = z.infer<typeof goalInput> & {
  id: string;
  status:
    "draft" | "planning" | "pending" | "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
};
export type Task = z.infer<typeof taskInput> & {
  id: string;
  status: "todo" | "doing" | "done";
  source: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export const planTask = taskInput
  .extend({ ref: text(40), dependsOn: z.array(z.string()).default([]) })
  .strict();
export const stages = z
  .array(z.object({ title: text(100), description: text(1000) }))
  .min(1)
  .max(12);
export const schemas = {
  coordinator: z.object({ summary: text(2000), intent: text(1000) }),
  learning: z.object({ summary: text(2000), stages }),
  life: z.object({
    summary: text(2000),
    constraints: z.array(z.string().max(500)).max(20),
  }),
  planner: z.object({
    summary: text(2000),
    reason: text(2000),
    tasks: z.array(planTask).max(50),
    moves: z
      .array(z.object({ taskId: z.string(), date, reason: text(500) }))
      .max(50),
  }),
  review: z.object({
    summary: text(3000),
    analysis: text(3000),
    suggestions: z.array(z.string().max(500)).max(10),
  }),
  quiz: z.object({
    summary: text(1000),
    questions: z
      .array(
        z.object({
          question: text(500),
          options: z.array(text(300)).length(4),
          correct: z.number().int().min(0).max(3),
          explanation: text(1500),
          topic: text(100),
        }),
      )
      .min(3)
      .max(10),
  }),
};
export const runInput = z
  .object({
    kind: z.enum(["plan", "quiz", "reschedule", "review"]),
    goal: z.string().optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .strict();
export const statusLabels = {
  draft: "草稿",
  planning: "规划中",
  pending: "待确认",
  active: "进行中",
  completed: "已完成",
  archived: "已归档",
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  queued: "排队中",
  running: "运行中",
  failed: "失败",
  cancelled: "已取消",
  applied: "已应用",
  rejected: "已保留原计划",
  stale: "已失效",
  succeeded: "已成功",
  waiting: "等待",
  skipped: "跳过",
} as const;
export const agentInfo = [
  {
    id: "coordinator",
    name: "协调 Agent",
    icon: "✳",
    desc: "理解目标，分派任务并汇总产出。",
  },
  {
    id: "learning",
    name: "学习 Agent",
    icon: "▤",
    desc: "设计路线、生成测验并追踪薄弱点。",
  },
  {
    id: "planner",
    name: "计划 Agent",
    icon: "▦",
    desc: "整合任务、容量与生活约束。",
  },
  {
    id: "life",
    name: "生活 Agent",
    icon: "♧",
    desc: "关注习惯、精力和固定安排。",
  },
  {
    id: "review",
    name: "复盘 Agent",
    icon: "◷",
    desc: "从真实执行记录中提炼调整建议。",
  },
];
