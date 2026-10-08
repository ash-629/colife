// 覆盖 D02：本机服务启动。
import { buildApp } from "./app";
import { config } from "./config";
const app = buildApp();
try {
  await app.listen({ port: config.port, host: "127.0.0.1" });
  console.log(`CoLife API http://127.0.0.1:${config.port}`);
} catch {
  console.error("CoLife 服务启动失败，请检查端口与配置。");
  process.exit(1);
}
