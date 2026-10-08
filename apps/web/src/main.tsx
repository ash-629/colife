// 覆盖 D02, P01：正式前端入口。
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
import "./formal.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
