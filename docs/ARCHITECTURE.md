# CoLife 技术架构

## 决策

- 前端：React + TypeScript + Vite，沿用原型视觉，使用服务端数据。
- 服务端：Node.js 24+、TypeScript、Fastify；本机监听 `127.0.0.1:4010`。
- 存储：Node 内置 SQLite，版本化 SQL 迁移；数据保存在 `data/colife.sqlite`，参数化查询与事务保障一致性。当前 Node 版本中的 SQLite 模块仍有实验性提示，使用范围限定于已验证的 DatabaseSync 基础接口。
- 校验：共享 Zod 契约，服务端再次验证模型输出与业务规则。
- 模型：DeepSeek；配置来自根目录 `.env`，密钥仅由服务端使用。
- 更新：短轮询读取运行状态；后台运行与节点记录持久化。重启中断的运行标为失败，可重试。
- 测试：Node 测试运行器 + Fastify 注入测试；前端类型检查、生产构建和浏览器核心流程。
- 部署：首版为本机单人空间。无需数据库容器，Docker 用于可选应用部署；不开放外网，不承诺多用户鉴权。

## 目录

`apps/web` 为正式界面，`apps/api` 为服务端，`shared` 为契约，`tests` 为规则与接口测试，`scripts` 为运行与验证入口。原 `prototype` 保持独立。

## 数据流

页面 → API 校验 → 领域服务 → SQLite。Agent：运行上下文快照 → DeepSeek 角色执行 → 输出校验 → 节点摘要 → 待确认提案 → 用户确认 → 事务应用。

## 约束

日程按日期和每日分钟容量管理，固定安排占用容量；任务依赖按完成状态和日期顺序检查。用户时区默认 Asia/Shanghai。模型生成提案不能绕过约束。既有目标重新规划失败保留原计划。新目标失败返回草稿。

目标任务全部完成仅表示进度 100%，目标需用户确认验收标准后完成。归档不删除历史。已完成任务不重新排期。提案依赖排期版本，相关数据变化后须重新生成。

客户端不能选择其他工作空间。更改数据的请求校验 Origin；模型配置不出现在 API、浏览器或日志。网络部署需先增加登录鉴权与用户归属模型。

参考：[Node SQLite](https://nodejs.org/api/sqlite.html)、[Vite](https://vite.dev/guide/)、[Fastify](https://fastify.dev/docs/latest/Reference/Server/)、[DeepSeek](https://api-docs.deepseek.com/zh-cn/)。
