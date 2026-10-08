// 覆盖 F07：统一请求与错误反馈，不读取服务端密钥。
export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "请求失败，请重试");
  return data;
}
