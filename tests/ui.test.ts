import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Form, Modal } from "../apps/web/src/components.js";
test("task dependencies use named multi-select with accessible task labels", () => {
  const html = renderToStaticMarkup(
    React.createElement(Form, {
      fields: [
        {
          name: "dependencies",
          label: "前置任务",
          type: "multiselect",
          value: ["a"],
          options: [{ value: "a", label: "完成基础学习" }],
        },
      ],
      onSubmit: async () => {},
    }),
  );
  assert.match(html, /multiple=""/);
  assert.match(html, /aria-label="前置任务"/);
  assert.match(html, /完成基础学习/);
  assert.match(html, /selected=""/);
});
test("modal failures remain visible in dialog and user text is escaped", () => {
  const html = renderToStaticMarkup(
    React.createElement(Modal, {
      title: "提案",
      error: "容量超出",
      onClose: () => {},
      children: "<script>alert(1)</script>",
    }),
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /容量超出/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
