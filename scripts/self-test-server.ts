// 独立自测环境；与正式共享服务的数据库分离。
import { buildApp } from "../apps/api/app";
import { Store } from "../apps/api/store";
const app = buildApp({
  store: new Store("data/self-test.sqlite"),
  allowedOrigins: ["http://127.0.0.1:4011"],
});
await app.listen({ host: "127.0.0.1", port: 4011 });
console.log("CoLife self-test server: 4011");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
