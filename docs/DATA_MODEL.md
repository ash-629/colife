# CoLife 数据模型

所有业务记录固定归属当前本机个人空间。SQLite `records` 表存储类型、ID、空间、JSON 业务字段、创建及更新时间；类型与字段由共享契约和领域服务验证，索引覆盖空间与类型。`meta` 存储排期版本；`schema_migrations` 记录迁移。事务一次性提交提案任务、目标状态、提案状态与排期版本。

| 类型 | 主要字段 | 规则 |
| --- | --- | --- |
| goal | title/type/deadline/minutes/criteria/context/status | 标题1–60字；每日15–480分钟；验收完成由用户确认 |
| task | title/goal/date/minutes/status/priority/dependencies/note/source/completedAt | 预计1–480分钟，任务关联存在，依赖无环且有效 |
| habit | name/target | 名称1–30字，目标1–60字 |
| checkin | habit/date | ID由习惯与日期构成，重复打卡幂等 |
| energy | date/value | 每天一个值：充沛/一般/疲惫 |
| focus | task/start/end/elapsedSeconds | 独立实际执行记录，计时由服务端时间确定 |
| note | goal/title/body | 标题1–60字，正文1–2000字 |
| resource | goal/title/url/description | 用户资料条目，URL限定http/https |
| route | goal/stages | 动态学习阶段，来自已成功学习节点 |
| quiz | goal/questions/answers/result/weaknesses | 服务端保存答案，提交前不返回正确答案 |
| run | kind/goal/status/nodes/context/configSnapshot/error | 协调、学习、生活、计划、复盘节点有状态和产出 |
| proposal | run/goal/tasks/moves/baseVersion/status/reason | 未确认不应用；唯一记录实现幂等；应用前重检 |
| review | range/facts/analysis/suggestions/proposal | 事实来自聚合，模型解释与事实分开 |
| settings | timezone/dailyMinutes/fixed/agents | 固定安排日期与分钟占用容量；Agent配置为运行快照 |
| activity | text/time | 来自真实业务事件 |

首版以服务层校验外键与唯一性，所有写入经领域服务，不提供任意记录写入接口。数据库备份使用 SQLite 在线备份接口，不直接复制运行中的 WAL 数据文件。
