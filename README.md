# 同频 CoLife

个人学习与生活的多 Agent 管理平台。正式应用已接入 DeepSeek 和 SQLite，提供目标、任务日程、学习测验、习惯精力、专注记录、协作提案与复盘。

## 启动正式应用

需要 Node.js 24 或以上。已在 Windows / Node.js 25.3.0 验证。

```powershell
git clone https://github.com/ash-629/colife.git
cd colife
npm ci
# 首次配置：仅在没有 .env 时执行，已有配置请保留
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# 在 .env 中填写 DEEPSEEK_API_KEY
npm run build
npm start
```

访问 [正式应用](http://127.0.0.1:4010)。服务只监听本机。SQLite 首次启动自动建表，之后保留已有数据。缺少模型 Key 时手动管理仍可使用。

开发模式使用 `npm run dev`，打开 [开发前端](http://127.0.0.1:5173)，API 在 4010。若正式服务正在运行，先停止再开启开发模式。

## 使用流程

对外体验请使用 [体验指南](docs/USER_GUIDE.md)：从登录入口开始，提供目标、规划、执行、学习与复盘的操作步骤、填写示例和预期结果。

1. 在时间设置中填写每日可用分钟与固定安排。
2. 创建学习／生活目标，写明截止日期、投入时间与验收标准。
3. 生成计划，查看各 Agent 的真实节点摘要，审阅提案后确认。未确认的任务不会进入执行日程。
4. 在看板／周日历管理任务与依赖，记录专注；任务完成率与目标验收分别处理。
5. 学习中心保存资料和笔记、生成测验、查看解析与薄弱点、确认复习提案。
6. 记录习惯与精力，生成排期差异；查看今日／本周真实统计，生成并应用复盘建议。

## 验证与维护

```powershell
npm run verify      # TypeScript、自动化测试、构建
npm run security:check # 检查Git跟踪文件中的凭证及敏感文件
npm run model:check # 真实模型最小接入检查，需要 Key 与网络
npm run migrate     # 幂等数据库初始化／迁移
npm run backup      # 在线一致性备份到 backups/
npm run restore -- backups/<备份文件>.sqlite
```

恢复命令创建新的 `data/restored-*.sqlite`，检查完整性并保留原数据库。停止服务后，将 `.env` 的 `DATABASE_PATH` 指向恢复文件，再启动。详情见 `docs/DEPLOYMENT.md`。

`npm run seed:demo` 仅创建独立的 `data/demo.sqlite`；示例带有 `[示例]` 标记，不修改正式数据库。需要体验示例时手动指定该数据库路径。

## 工程与文档

- `apps/web`：React / TypeScript 七页正式界面。
- `apps/api`：Fastify、领域规则、DeepSeek 适配与 Agent 编排。
- `shared`：输入与结构化输出契约。
- `tests`：领域规则、接口、编排恢复、持久化与界面语义验证。
- `docs/PRD.md`、`PROTOTYPE.md`：产品设计与原型规范。
- `docs/ARCHITECTURE.md`、`DATA_MODEL.md`、`API_CONTRACT.md`：正式架构与契约。
- `docs/IMPLEMENTATION_LOG.md`、`TRACEABILITY.md`、`ACCEPTANCE.md`：分步实施与验收。
- `docs/SELF_TEST_REPORT.md`：全功能自测报告，79项自动化测试与真实模型、浏览器验证。
- `docs/MODEL_CONFIGURATION.md`、`DEPLOYMENT.md`：模型配置与运维。

## 独立原型

`npm run prototype` 后打开 [产品原型](http://127.0.0.1:4173)。原型使用浏览器 localStorage、固定日期及模拟 Agent，保留作设计参考；正式应用使用服务端数据库、当前时区日期与真实模型。

## 当前边界

首版面向本机个人空间，日程按日期和分钟容量管理；暂不包含远程多用户登录、具体时段拖拽、通知、外部日历同步和自动资料检索。资料链接由用户填写。模型建议须通过业务校验与用户确认。Node.js 的 `node:sqlite` 在当前运行环境有实验特性提示，数据库仍通过持久化与备份验证。

## 凭证与公开源码

仓库只提供Key为空的`.env.example`，每位使用者需自行配置本机`.env`。实际Key仅供服务端调用，禁止放入前端`VITE_*`变量。数据库、备份、ngrok凭证、日志和构建产物均忽略提交。公开代码不代表共享模型账号或个人数据，详见[安全说明](SECURITY.md)。
