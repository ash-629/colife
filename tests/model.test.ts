import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { config } from "../apps/api/config";
import { callDeepSeek } from "../apps/api/model";
const schema = z.object({ summary: z.string() });
test("missing model key fails clearly without network request", async () => {
  const key = config.apiKey,
    original = globalThis.fetch;
  let calls = 0;
  try {
    config.apiKey = "";
    globalThis.fetch = async () => {
      calls++;
      throw Error("unexpected network");
    };
    await assert.rejects(
      callDeepSeek("协调 Agent", schema, {}, new AbortController().signal),
      /未配置/,
    );
    assert.equal(calls, 0);
  } finally {
    config.apiKey = key;
    globalThis.fetch = original;
  }
});
test("invalid credentials do not retry or expose upstream response", async () => {
  const key = config.apiKey,
    original = globalThis.fetch;
  let calls = 0;
  try {
    config.apiKey = "test-only";
    globalThis.fetch = async () => {
      calls++;
      return new Response("private upstream response", { status: 401 });
    };
    await assert.rejects(
      callDeepSeek("协调 Agent", schema, {}, new AbortController().signal),
      (e) => {
        assert.match((e as Error).message, /HTTP 401/);
        assert.doesNotMatch(
          (e as Error).message,
          /private upstream response|test-only/,
        );
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    config.apiKey = key;
    globalThis.fetch = original;
  }
});
test("rate limit retries then parses validated output", async () => {
  const key = config.apiKey,
    original = globalThis.fetch,
    retries = config.retries;
  let calls = 0;
  try {
    config.apiKey = "test-only";
    config.retries = 1;
    globalThis.fetch = async () => {
      calls++;
      return calls === 1
        ? new Response("", { status: 429 })
        : Response.json({
            choices: [{ message: { content: '{"summary":"已完成"}' } }],
          });
    };
    assert.equal(
      (
        await callDeepSeek(
          "协调 Agent",
          schema,
          {},
          new AbortController().signal,
        )
      ).summary,
      "已完成",
    );
    assert.equal(calls, 2);
  } finally {
    config.apiKey = key;
    config.retries = retries;
    globalThis.fetch = original;
  }
});
