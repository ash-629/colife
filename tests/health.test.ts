// 覆盖 D02：健康响应与密钥隔离。
import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../apps/api/app";
import { Store } from "../apps/api/store";
test("health returns service status without credentials", async () => {
  const app = buildApp({ store: new Store(":memory:") });
  try {
    const response = await app.inject("/api/health");
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.model.provider, "deepseek");
    assert.equal(typeof body.model.configured, "boolean");
    assert.equal("apiKey" in body.model, false);
  } finally {
    await app.close();
  }
});
