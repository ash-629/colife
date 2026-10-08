// 覆盖 F01-F07, P01-P07：本机API、校验、同源保护、错误处理。
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import { config } from "./config";
import { Store } from "./store";
import { Domain, fail } from "./domain";
import { Runs } from "./runs";
import type { ModelCall } from "./model";
import { date, habitInput } from "../../shared/contracts";
export function buildApp(
  options: { store?: Store; model?: ModelCall; allowedOrigins?: string[] } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 1048576 }),
    store = options.store || new Store(config.database),
    domain = new Domain(store),
    runs = new Runs(domain, options.model);
  app.addHook("onClose", async () => {
    await runs.close();
    store.close();
  });
  app.addHook("onRequest", async (request) => {
    const origin = request.headers.origin;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      origin &&
      !new Set([
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        `http://127.0.0.1:${config.port}`,
        `http://localhost:${config.port}`,
        ...config.publicOrigins,
        ...(options.allowedOrigins || []),
      ]).has(origin)
    )
      fail("请求来源不允许", 403);
  });
  app.get("/api/health", async () => ({
    ok: true,
    service: "colife",
    model: {
      provider: "deepseek",
      name: config.model,
      configured: !!config.apiKey,
    },
  }));
  app.get("/api/state", async () => ({
    ...domain.state(),
    modelConfigured: !!config.apiKey,
  }));
  app.get("/api/search", async (request) => {
    const { q } = z
      .object({ q: z.string().trim().max(100).default("") })
      .parse(request.query);
    return {
      results: q
        ? [
            ...store
              .list("goal")
              .filter((g) => g.title.toLowerCase().includes(q.toLowerCase()))
              .map((g) => ({ kind: "goal", id: g.id, title: g.title })),
            ...store
              .list("task")
              .filter((t) => t.title.toLowerCase().includes(q.toLowerCase()))
              .map((t) => ({ kind: "task", id: t.id, title: t.title })),
          ].slice(0, 20)
        : [],
    };
  });
  app.post("/api/runs", async (r) => runs.start(r.body));
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (r) =>
    runs.get(r.params.id),
  );
  app.post<{ Params: { id: string } }>("/api/runs/:id/retry", async (r) =>
    runs.retry(r.params.id),
  );
  app.post<{ Params: { id: string } }>("/api/runs/:id/cancel", async (r) =>
    runs.cancel(r.params.id),
  );
  app.get("/api/settings", async () => domain.settings());
  app.put("/api/settings", async (r) => domain.updateSettings(r.body));
  app.post("/api/goals", async (r) => domain.goal(r.body));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/goals/:id",
    async (r) => domain.updateGoal(r.params.id, r.body),
  );
  app.post("/api/tasks", async (r) => domain.task(r.body));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/tasks/:id",
    async (r) => domain.updateTask(r.params.id, r.body),
  );
  app.delete<{ Params: { id: string } }>("/api/tasks/:id", async (r) => {
    domain.deleteTask(r.params.id);
    return { ok: true };
  });
  app.post("/api/habits", async (r) => domain.habit(r.body));
  app.patch<{ Params: { id: string } }>("/api/habits/:id", async (r) =>
    store.put(
      "habit",
      { ...domain.require("habit", r.params.id), ...habitInput.parse(r.body) },
      r.params.id,
    ),
  );
  app.delete<{ Params: { id: string } }>("/api/habits/:id", async (r) => {
    domain.require("habit", r.params.id);
    store.delete("habit", r.params.id);
    store
      .list("checkin")
      .filter((c) => c.habit === r.params.id)
      .forEach((c) => store.delete("checkin", c.id));
    return { ok: true };
  });
  for (const method of ["PUT", "DELETE"] as const)
    app.route<{ Params: { id: string } }>({
      method,
      url: "/api/habits/:id/checkin",
      handler: async (r) =>
        domain.checkin(
          r.params.id,
          z.object({ date }).parse(r.body).date,
          method === "PUT",
        ),
    });
  app.put("/api/energy", async (r) => {
    const input = z
      .object({ date, value: z.enum(["充沛", "一般", "疲惫"]) })
      .strict()
      .parse(r.body);
    return domain.energy(input.date, input.value);
  });
  app.post("/api/notes", async (r) => domain.note(r.body));
  app.patch<{ Params: { id: string } }>("/api/notes/:id", async (r) =>
    domain.note(r.body, r.params.id),
  );
  app.delete<{ Params: { id: string } }>("/api/notes/:id", async (r) => {
    domain.require("note", r.params.id);
    store.delete("note", r.params.id);
    return { ok: true };
  });
  app.post("/api/resources", async (r) => domain.resource(r.body));
  app.delete<{ Params: { id: string } }>("/api/resources/:id", async (r) => {
    domain.require("resource", r.params.id);
    store.delete("resource", r.params.id);
    return { ok: true };
  });
  app.post("/api/focus", async (r) =>
    domain.focus(z.object({ task: z.string() }).strict().parse(r.body).task),
  );
  for (const action of ["pause", "resume", "finish"])
    app.post<{ Params: { id: string } }>(
      `/api/focus/:id/${action}`,
      async (r) => domain.focusAction(r.params.id, action),
    );
  for (const action of ["apply", "reject"])
    app.post<{ Params: { id: string } }>(
      `/api/proposals/:id/${action}`,
      async (r) =>
        action === "apply"
          ? domain.apply(r.params.id)
          : domain.reject(r.params.id),
    );
  app.post<{ Params: { id: string } }>("/api/quizzes/:id/submit", async (r) =>
    domain.submitQuiz(
      r.params.id,
      z
        .object({ answers: z.array(z.number().int()) })
        .strict()
        .parse(r.body).answers,
    ),
  );
  app.post<{ Params: { id: string } }>("/api/quizzes/:id/revision", async (r) =>
    domain.revision(r.params.id),
  );
  app.get("/api/stats", async (r) => {
    const { from, to } = z.object({ from: date, to: date }).parse(r.query);
    if (
      from > to ||
      new Date(to).getTime() - new Date(from).getTime() > 90 * 86400000
    )
      fail("统计范围必须为 1–91 天", 400);
    return domain.stats(from, to);
  });
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; code?: string };
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 3)
            .join("；"),
        },
        requestId: request.id,
      });
      return;
    }
    reply.status(err.statusCode || 500).send({
      error: {
        code: err.code || "INTERNAL_ERROR",
        message: err.statusCode ? err.message : "服务暂时不可用，请重试",
      },
      requestId: request.id,
    });
  });
  const staticRoot = path.resolve("dist/web");
  if (existsSync(staticRoot)) {
    app.register(staticFiles, { root: staticRoot });
    app.setNotFoundHandler((r, reply) =>
      r.url.startsWith("/api")
        ? reply
            .status(404)
            .send({ error: { code: "NOT_FOUND", message: "接口不存在" } })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
