// 覆盖 D02, D06：服务端配置；禁止导出密钥到客户端。
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(".env"), quiet: true });
export const config = {
  publicOrigins: (process.env.PUBLIC_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new URL(s).origin),
  port: Number(process.env.API_PORT || 4010),
  database: process.env.DATABASE_PATH || "data/colife.sqlite",
  baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  timeout: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 60000),
  retries: Number(process.env.LLM_MAX_RETRIES || 2),
};
