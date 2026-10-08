# DeepSeek 模型配置

模型供应商为 DeepSeek。配置文件为工程根目录 `.env`，配置模板为 `.env.example`。模板中的 API Key 保持为空；使用者需在本机填写自己的密钥，仅供服务端调用。

## 配置项

| 配置项 | 当前值 | 说明 |
| --- | --- | --- |
| `LLM_PROVIDER` | `deepseek` | 五个 Agent 共用的模型供应商 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 官方 OpenAI 兼容 API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 初始模型，可按实际需要修改 |
| `DEEPSEEK_API_KEY` | 模板为空 | 本机由用户填写，服务端读取 |
| `LLM_REQUEST_TIMEOUT_MS` | `60000` | 应用层单次请求超时，单位毫秒 |
| `LLM_MAX_RETRIES` | `2` | 应用层最多额外重试次数 |

API 地址与初始模型名称依据 [DeepSeek 官方接入文档](https://api-docs.deepseek.com/zh-cn/)。请求超时和重试次数为本项目的初始策略，并非供应商限制。

## 实施约束

- 五个 Agent 通过统一 DeepSeek 适配层调用模型，使用各自的职责、上下文和输出结构。
- 服务端读取与校验 `.env`；API Key 为空时返回“模型服务未配置”，不发起请求，基础手动管理继续可用。
- API Key 不发送到前端，不写入 Agent 输出、请求日志或浏览器存储。
- `.env` 已加入忽略规则；`.env.example` 可作为项目配置模板提交。
- 重试仅用于可恢复错误；无效凭证、权限与非法参数不自动重试；提案应用仍由业务幂等规则保障。

正式应用已完成统一适配、结构化校验、有限重试、取消与真实协作验证。独立 prototype 仍为模拟执行，不读取这些配置。
