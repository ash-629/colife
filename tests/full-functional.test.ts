import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../apps/api/app";
import { Store } from "../apps/api/store";
import { Domain, addDay, day } from "../apps/api/domain";

const valid = {
  title: "边界测试",
  type: "学习",
  deadline: "2099-01-01",
  minutes: 120,
};
const invalidGoals: [string, any][] = [
  ["blank title", { title: "  " }],
  ["title overflow", { title: "字".repeat(61) }],
  ["missing title", { title: undefined }],
  ["wrong type", { type: "其它" }],
  ["invalid calendar date", { deadline: "2026-02-30" }],
  ["malformed date", { deadline: "2026-1-1" }],
  ["past deadline", { deadline: "2000-01-01" }],
  ["low minutes", { minutes: 14 }],
  ["high minutes", { minutes: 481 }],
  ["fraction minutes", { minutes: 15.5 }],
  ["string minutes", { minutes: "30" }],
  ["criteria overflow", { criteria: "字".repeat(301) }],
  ["context overflow", { context: "字".repeat(501) }],
  ["unknown field", { workspace: "other" }],
];
for (const [label, change] of invalidGoals)
  test(`goal boundary: ${label}`, async () => {
    const app = buildApp({ store: new Store(":memory:") });
    try {
      const r = await app.inject({
        method: "POST",
        url: "/api/goals",
        payload: { ...valid, ...change },
      });
      assert.equal(r.statusCode, 400);
      assert.ok(r.json().requestId);
      assert.equal((await app.inject("/api/state")).json().goals.length, 0);
    } finally {
      await app.close();
    }
  });

test("all manual CRUD routes, search, fixed arrangements, statistics and missing IDs", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  const req = async (method: any, url: string, payload?: any, status = 200) => {
    const r = await app.inject({ method, url, payload });
    assert.equal(r.statusCode, status, `${method} ${url}: ${r.body}`);
    return r.json();
  };
  try {
    const state = await req("GET", "/api/state"),
      today = state.today;
    assert.equal((await req("GET", "/api/health")).ok, true);
    assert.equal(state.goals.length, 0);
    const g = await req("POST", "/api/goals", {
      ...valid,
      title: " CRUD React ",
      criteria: "完成所有任务",
    });
    assert.equal(g.title, "CRUD React");
    await req("PATCH", `/api/goals/${g.id}`, { title: "React 学习" });
    const t = await req("POST", "/api/tasks", {
      title: "React 实践",
      goal: g.id,
      date: today,
      minutes: 15,
      note: "记录",
    });
    const child = await req("POST", "/api/tasks", {
      title: "依赖任务",
      goal: g.id,
      date: today,
      minutes: 15,
      dependencies: [t.id],
    });
    await req("PATCH", `/api/tasks/${child.id}`, { status: "doing" }, 409);
    await req("DELETE", `/api/tasks/${t.id}`, undefined, 409);
    await req("PATCH", `/api/tasks/${t.id}`, {
      status: "doing",
      priority: "高",
    });
    await req("PATCH", `/api/tasks/${t.id}`, { status: "done" });
    await req("PATCH", `/api/tasks/${child.id}`, { status: "done" });
    await req("PATCH", `/api/tasks/${t.id}`, { status: "todo" }, 409);
    await req("DELETE", `/api/tasks/${child.id}`, undefined, 409);
    await req("PATCH", `/api/tasks/${child.id}`, { status: "todo" });
    await req("DELETE", `/api/tasks/${child.id}`);
    const h = await req("POST", "/api/habits", {
      name: "阅读",
      target: "20分钟",
    });
    await req("PATCH", `/api/habits/${h.id}`, {
      name: "阅读记录",
      target: "10页",
    });
    await req("PUT", `/api/habits/${h.id}/checkin`, { date: today });
    await req("PUT", `/api/habits/${h.id}/checkin`, { date: today });
    assert.equal((await req("GET", "/api/state")).checkins.length, 1);
    await req(
      "PUT",
      `/api/habits/${h.id}/checkin`,
      { date: addDay(today, 1) },
      400,
    );
    await req("DELETE", `/api/habits/${h.id}/checkin`, { date: today });
    await req("PUT", `/api/habits/${h.id}/checkin`, { date: today });
    await req("DELETE", `/api/habits/${h.id}`);
    assert.equal((await req("GET", "/api/state")).checkins.length, 0);
    await req("PUT", "/api/energy", { date: today, value: "疲惫" });
    await req("PUT", "/api/energy", { date: today, value: "充沛" });
    assert.equal((await req("GET", "/api/state")).energies.length, 1);
    await req(
      "PUT",
      "/api/energy",
      { date: addDay(today, 1), value: "一般" },
      400,
    );
    const n = await req("POST", "/api/notes", {
      goal: g.id,
      title: "记录",
      body: "学习收获",
    });
    await req("PATCH", `/api/notes/${n.id}`, {
      goal: g.id,
      title: "更新",
      body: "更新内容",
    });
    await req("DELETE", `/api/notes/${n.id}`);
    const resource = await req("POST", "/api/resources", {
      goal: g.id,
      title: "React",
      url: "https://react.dev",
    });
    await req("DELETE", `/api/resources/${resource.id}`);
    const f = await req("POST", "/api/focus", { task: t.id });
    await req("POST", "/api/focus", { task: t.id }, 409);
    await req("POST", `/api/focus/${f.id}/pause`);
    await req("POST", `/api/focus/${f.id}/resume`);
    await req("POST", `/api/focus/${f.id}/finish`);
    await req("POST", `/api/focus/${f.id}/finish`);
    assert.equal(
      (await req("GET", `/api/stats?from=${today}&to=${today}`)).completed,
      1,
    );
    assert.equal((await req("GET", "/api/search?q=React")).results.length, 2);
    assert.equal((await req("GET", "/api/search")).results.length, 0);
    const settings = await req("GET", "/api/settings");
    const input = {
      timezone: settings.timezone,
      dailyMinutes: 120,
      agents: settings.agents,
      fixed: [{ id: "f1", title: "固定安排", date: today, minutes: 105 }],
    };
    await req("PUT", "/api/settings", input);
    await req("PUT", "/api/settings", { ...input, dailyMinutes: 119 }, 409);
    assert.equal((await req("GET", "/api/settings")).dailyMinutes, 120);
    await req("PATCH", `/api/goals/${g.id}`, { status: "completed" });
    await req("PATCH", `/api/goals/${g.id}`, { status: "archived" });
    for (const url of [
      "/api/tasks/missing",
      "/api/habits/missing",
      "/api/notes/missing",
      "/api/resources/missing",
    ])
      await req("DELETE", url, undefined, 404);
    for (const url of [
      "/api/runs/missing/retry",
      "/api/runs/missing/cancel",
      "/api/proposals/missing/apply",
      "/api/proposals/missing/reject",
      "/api/quizzes/missing/revision",
      "/api/focus/missing/finish",
    ])
      await req("POST", url, undefined, 404);
    await req("GET", "/api/runs/missing", undefined, 404);
    await req("GET", "/api/unknown", undefined, 404);
  } finally {
    await app.close();
  }
});

const boundaryRoutes: [string, string, any][] = [
  ["POST", "/api/tasks", { title: "", date: "2099-01-01", minutes: 30 }],
  [
    "POST",
    "/api/tasks",
    { title: "字".repeat(81), date: "2099-01-01", minutes: 30 },
  ],
  ["POST", "/api/tasks", { title: "t", date: "2099-01-01", minutes: 0 }],
  ["POST", "/api/tasks", { title: "t", date: "2099-01-01", minutes: 481 }],
  ["POST", "/api/tasks", { title: "t", date: "2099-01-01", minutes: 1.5 }],
  ["POST", "/api/tasks", { title: "t", date: "bad", minutes: 30 }],
  [
    "POST",
    "/api/tasks",
    { title: "t", date: "2099-01-01", minutes: 30, priority: "urgent" },
  ],
  [
    "POST",
    "/api/tasks",
    {
      title: "t",
      date: "2099-01-01",
      minutes: 30,
      dependencies: Array(31).fill("a"),
    },
  ],
  [
    "POST",
    "/api/tasks",
    { title: "t", date: "2099-01-01", minutes: 30, note: "字".repeat(2001) },
  ],
  ["POST", "/api/habits", { name: " ", target: "每天" }],
  ["POST", "/api/habits", { name: "字".repeat(31), target: "每天" }],
  ["POST", "/api/habits", { name: "习惯", target: "字".repeat(61) }],
  ["POST", "/api/notes", { title: "笔记", body: " " }],
  ["POST", "/api/notes", { title: "字".repeat(61), body: "正文" }],
  ["POST", "/api/notes", { title: "笔记", body: "字".repeat(2001) }],
  [
    "POST",
    "/api/resources",
    { goal: "g", title: "资源", url: "javascript:alert(1)" },
  ],
  [
    "POST",
    "/api/resources",
    { goal: "g", title: "资源", url: "file:///C:/secret" },
  ],
  ["POST", "/api/resources", { goal: "g", title: "资源", url: "not-url" }],
  [
    "POST",
    "/api/resources",
    { goal: "g", title: "字".repeat(101), url: "https://example.com" },
  ],
  ["PUT", "/api/energy", { date: "2099-01-01", value: "good" }],
  ["POST", "/api/runs", { kind: "unknown" }],
  ["POST", "/api/runs", { kind: "plan" }],
  ["POST", "/api/focus", {}],
];
for (const [method, url, payload] of boundaryRoutes)
  test(`input rejection ${method} ${url}: ${JSON.stringify(payload).slice(0, 85)}`, async () => {
    const app = buildApp({ store: new Store(":memory:") });
    try {
      assert.equal(
        (await app.inject({ method: method as any, url, payload })).statusCode,
        400,
      );
    } finally {
      await app.close();
    }
  });

test("settings boundaries, timezones, stats ranges and inert injection strings", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  try {
    const s = (await app.inject("/api/settings")).json();
    const base = {
      timezone: s.timezone,
      dailyMinutes: s.dailyMinutes,
      fixed: [],
      agents: s.agents,
    };
    for (const change of [
      { timezone: "bad" },
      { dailyMinutes: 14 },
      { dailyMinutes: 961 },
      { dailyMinutes: 15.1 },
      { agents: { ...s.agents, planner: "yes" } },
      {
        fixed: Array(101).fill({
          id: "f",
          title: "x",
          date: "2099-01-01",
          minutes: 1,
        }),
      },
    ])
      assert.equal(
        (
          await app.inject({
            method: "PUT",
            url: "/api/settings",
            payload: { ...base, ...change },
          })
        ).statusCode,
        400,
      );
    for (const minutes of [15, 960])
      assert.equal(
        (
          await app.inject({
            method: "PUT",
            url: "/api/settings",
            payload: { ...base, dailyMinutes: minutes },
          })
        ).statusCode,
        200,
      );
    assert.equal(
      day("America/Los_Angeles", new Date("2026-10-08T01:00:00Z")),
      "2026-10-07",
    );
    for (const query of [
      "from=bad&to=2026-10-08",
      "from=2026-10-09&to=2026-10-08",
      "from=2026-01-01&to=2026-12-31",
    ])
      assert.equal((await app.inject(`/api/stats?${query}`)).statusCode, 400);
    for (const title of ["' OR 1=1; --", "<img src=x onerror=alert(1)>"])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/goals",
            payload: { ...valid, title },
          })
        ).statusCode,
        200,
      );
    assert.equal((await app.inject("/api/state")).json().goals.length, 2);
    assert.equal(
      (await app.inject(`/api/search?q=${"x".repeat(101)}`)).statusCode,
      400,
    );
    const bad = await app.inject({
      method: "POST",
      url: "/api/goals",
      headers: { "content-type": "application/json" },
      payload: "{broken",
    });
    assert.equal(bad.statusCode, 400);
    assert.ok(!bad.body.includes("apiKey"));
  } finally {
    await app.close();
  }
});

test("non-object patch bodies are validation errors rather than server failures", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  try {
    const g = (
      await app.inject({ method: "POST", url: "/api/goals", payload: valid })
    ).json();
    for (const payload of [null, [], "bad", 42]) {
      const r = await app.inject({
        method: "PATCH",
        url: `/api/goals/${g.id}`,
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(payload),
      });
      assert.equal(
        r.statusCode,
        400,
        `payload=${JSON.stringify(payload)} ${r.body}`,
      );
    }
  } finally {
    await app.close();
  }
});

test("focus respects unfinished dependency guards", () => {
  const s = new Store(":memory:"),
    d = new Domain(s);
  try {
    const a = d.task({ title: "先修", date: d.today(), minutes: 15 });
    const b = d.task({
      title: "后续",
      date: d.today(),
      minutes: 15,
      dependencies: [a.id],
    });
    assert.throws(() => d.focus(b.id), /依赖任务未完成/);
    assert.equal(s.list("focus").length, 0);
    d.updateTask(a.id, { status: "done" });
    assert.equal(d.focus(b.id).status, "running");
  } finally {
    s.close();
  }
});

test("explicit empty or wrong status cannot silently preserve the old status", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  try {
    const g = (
      await app.inject({ method: "POST", url: "/api/goals", payload: valid })
    ).json();
    const today = (await app.inject("/api/state")).json().today;
    const t = (
      await app.inject({
        method: "POST",
        url: "/api/tasks",
        payload: { title: "状态测试", date: today, minutes: 15 },
      })
    ).json();
    for (const url of [`/api/goals/${g.id}`, `/api/tasks/${t.id}`]) {
      for (const status of ["", null, false, 0, "unknown"])
        assert.equal(
          (await app.inject({ method: "PATCH", url, payload: { status } }))
            .statusCode,
          400,
          `${url} status=${status}`,
        );
      for (const payload of [null, [], "bad", 42])
        assert.equal(
          (
            await app.inject({
              method: "PATCH",
              url,
              headers: { "content-type": "application/json" },
              payload: JSON.stringify(payload),
            })
          ).statusCode,
          400,
        );
    }
  } finally {
    await app.close();
  }
});
