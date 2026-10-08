// 覆盖 D06：实际DeepSeek连通性验证，不输出密钥或响应正文。
import { z } from "zod";
import { callDeepSeek } from "../apps/api/model";
import { config } from "../apps/api/config";
try {
  await callDeepSeek(
    "连通性检查",
    z.object({ summary: z.string().min(1).max(1000) }),
    {
      request: {
        kind: "health",
        instruction: "仅返回一条中文连通性确认，不包含个人数据。",
      },
    },
    new AbortController().signal,
  );
  console.log(
    JSON.stringify({
      ok: true,
      provider: "deepseek",
      model: config.model,
      credentialConfigured: !!config.apiKey,
    }),
  );
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
