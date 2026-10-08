# CoLife API 契约

前缀 `/api`。成功返回 JSON 对象；错误 `{error:{code,message},requestId}`。400字段错误，404资源不存在，409业务冲突，503模型未配置，502上游错误。请求正文必须经共享契约校验，所有ID仅查询本机个人空间。

| 方法与路径 | 用途 |
| --- | --- |
| GET /health | 状态与是否配置模型，不返回密钥 |
| GET /state | 当前空间业务数据、今日日期、排期版本、脱敏测验与统计 |
| GET /search?q= | 搜索任务与目标 |
| GET/PUT /settings | 时区、每日容量、固定安排与Agent开关 |
| POST /goals | 创建草稿目标 |
| PATCH /goals/:id | 修改目标／验收完成／归档 |
| POST /tasks | 新建手动任务 |
| PATCH/DELETE /tasks/:id | 修改状态、排期、依赖／删除未完成任务 |
| POST/PATCH/DELETE /habits/:id | 习惯管理（新增为POST /habits） |
| PUT/DELETE /habits/:id/checkin | 指定日期打卡／撤销 |
| PUT /energy | 保存指定日期精力 |
| POST/PATCH/DELETE /notes/:id | 笔记（新增为POST /notes） |
| POST/DELETE /resources/:id | 资料（新增为POST /resources） |
| POST /focus | 开始任务专注 |
| POST /focus/:id/pause,resume,finish | 分段计时与结束保存 |
| POST /runs | kind=plan/quiz/reschedule/review，后台真实协作 |
| GET /runs/:id | 节点、摘要与产出 |
| POST /runs/:id/retry,cancel | 失败重试／取消 |
| POST /proposals/:id/apply,reject | 事务应用／保留原计划 |
| POST /quizzes/:id/submit | 服务端计分，答完才能提交 |
| POST /quizzes/:id/revision | 创建唯一复习提案 |
| GET /stats?from=&to= | 完成、专注、习惯、趋势与计划差异 |

模型请求超时与重试遵循配置，鉴权错误不重试。重试复用有效成功节点，配置快照不变。取消阻止新节点与后续产出落地。前端使用运行ID轮询，不以动画代替进度。
