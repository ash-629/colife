// 覆盖 D04/D05/D11：接口主流程、输入校验与来源隔离。
import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../apps/api/store";
import { buildApp } from "../apps/api/app";
import { addDay } from "../apps/api/domain";
test("manual goal and task lifecycle persists in shared state", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  try {
    const request = (method: any, url: string, payload?: any) =>
      app.inject({ method, url, payload });
    const state = (await request("GET", "/api/state")).json(),
      today = state.today;
    const g = (
      await request("POST", "/api/goals", {
        title: "React",
        type: "学习",
        deadline: addDay(today, 7),
        minutes: 120,
        criteria: "完成项目",
      })
    ).json();
    const bad = await request("POST", "/api/tasks", {
      title: " ",
      date: today,
      minutes: 30,
    });
    assert.equal(bad.statusCode, 400);
    const t = (
      await request("POST", "/api/tasks", {
        title: "学习 Hooks",
        goal: g.id,
        date: today,
        minutes: 30,
      })
    ).json();
    assert.equal(
      (await request("PATCH", `/api/tasks/${t.id}`, { status: "done" }))
        .statusCode,
      200,
    );
    const stats = (
      await request("GET", `/api/stats?from=${today}&to=${today}`)
    ).json();
    assert.equal(stats.scheduledDone, 1);
    assert.equal(
      (await request("PATCH", `/api/goals/${g.id}`, { status: "completed" }))
        .statusCode,
      200,
    );
    assert.equal((await request("GET", "/api/state")).json().tasks.length, 1);
    assert.equal(
      (await request("PATCH", "/api/tasks/other-space", { status: "done" }))
        .statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
test("unknown origins and invalid settings are blocked", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/goals",
          headers: { origin: "https://untrusted.example" },
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/api/settings",
          payload: { timezone: "bad" },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject("/api/stats?from=2026-01-01&to=2026-12-31")).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});
test("temporary sharing allows only the configured exact origin", async () => {
  const origin = "https://colife-test.ngrok-free.app";
  const app = buildApp({
    store: new Store(":memory:"),
    allowedOrigins: [origin],
  });
  try {
    const today = (await app.inject("/api/state")).json().today;
    const payload = {
      title: "共享体验",
      type: "学习",
      deadline: addDay(today, 7),
      minutes: 30,
    };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/goals",
          headers: { origin },
          payload,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/goals",
          headers: { origin: "https://other.ngrok-free.app" },
          payload,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/goals",
          headers: { origin: origin + ".untrusted.example" },
          payload,
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
  }
});
