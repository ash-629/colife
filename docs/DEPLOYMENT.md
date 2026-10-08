# 运行与维护

## 运行环境

Node.js ≥ 24；npm 按 package-lock.json 安装依赖。Windows / Node.js 25.3.0 已验证。存储为 SQLite，不需要 Docker 或独立数据库服务。应用只监听 `127.0.0.1`，默认端口 4010；本版本不对公网部署提供身份认证。

执行 `npm ci` → 配置 `.env` → `npm run verify` → `npm start`。`npm run dev` 同时启动 4010 API 与 5173 Vite。前端构建写入 `dist/web`，生产服务提供前端静态文件与 API。

## 配置

`.env.example` 的 Key 保持为空，实际 Key 只存本机 `.env`，由服务端读取。禁止在前端添加 VITE_* 密钥变量。`API_PORT` 可改变端口；`DATABASE_PATH` 默认 `data/colife.sqlite`。修改配置后重启 API。

`GET /api/health` 返回服务与模型配置状态，不返回密钥。日志不记录请求正文、授权头和模型原始错误。普通接口错误包含 requestId；协作节点持久化业务摘要、时间和产出。

## 数据与迁移

首次启动初始化 schema_migrations v1、records、meta 和工作区索引。`npm run migrate` 可重复执行。数据、备份、构建产物和 `.env` 均不纳入源码提交。重启不会注入示例或重置数据。

## 备份与恢复

`npm run backup` 调用 SQLite 在线备份接口，将一致性快照写到 `backups/colife-<时间>.sqlite`，不复制使用中的 WAL 文件。备份包含个人业务数据，不包含模型 Key。

执行 `npm run restore -- <备份路径>`，先检查 `PRAGMA integrity_check` 与迁移表，再生成独立 `data/restored-<时间>.sqlite`。停止应用，在 `.env` 设置 `DATABASE_PATH` 为返回的恢复文件路径，再启动。原数据库与备份保留，可将路径改回以回退。

## 运行恢复

请求超时／限流等可恢复模型错误有有限次数重试；无效凭证不自动重试。节点失败会保存已成功的上游结果。用户重试仅重新执行失败节点和下游，将业务校验错误送回模型修正。服务重启将中断运行标记为失败，允许手动恢复；已接受的计划不回滚。

提案确认使用事务与版本检查。重复应用同一提案返回既有结果；日程或精力变化使旧版本提案不可应用，应重新生成。取消协作后到达的模型输出不会落地。

## 日常检查

`npm run verify`、`npm audit --audit-level=high`；真实接入检查用 `npm run model:check`。测试采用独立内存／临时数据库，不修改正式库。示例脚本使用单独 `data/demo.sqlite`，不会覆盖用户数据。
