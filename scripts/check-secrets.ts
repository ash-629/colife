// 只报告文件和规则名称，绝不输出匹配到的凭证正文。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const knownSecrets = new Set<string>();
if (existsSync(".env")) {
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
    if (match && /(?:API_KEY|TOKEN|PASSWORD|SECRET)$/.test(match[1])) {
      const value = match[2].replace(/^["']|["']$/g, "");
      if (value.length >= 8) knownSecrets.add(value);
    }
  }
}
const policyPath = "data/ngrok-traffic-policy.json";
if (existsSync(policyPath)) {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  for (const rule of policy.on_http_request || []) {
    for (const action of rule.actions || []) {
      if (action.type === "basic-auth") {
        for (const credential of action.config?.credentials || []) {
          if (typeof credential !== "string") continue;
          knownSecrets.add(credential);
          const password = credential.slice(credential.indexOf(":") + 1);
          if (password.length >= 8) knownSecrets.add(password);
        }
      }
    }
  }
}
const issues: { file: string; rule: string; source: string }[] = [];
const credentialPattern =
  /(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
function inspect(file: string, content: string, source: string) {
  if (credentialPattern.test(content))
    issues.push({ file, rule: "凭证格式", source });
  if ([...knownSecrets].some((secret) => content.includes(secret)))
    issues.push({ file, rule: "本机实际凭证", source });
  if (
    file === ".env.example" &&
    /^[ \t]*DEEPSEEK_API_KEY[ \t]*=[ \t]*[^\r\n \t]+/m.test(content)
  )
    issues.push({ file, rule: "配置模板Key必须为空", source });
}
for (const file of files) {
  const base = path.basename(file);
  if (
    (/^\.env(?:\.|$)/.test(base) && base !== ".env.example") ||
    /^(?:data|backups|node_modules|dist|coverage)\//.test(file) ||
    /\.(?:sqlite|db)(?:-.*)?$|\.(?:pem|key|p12|pfx|log)$|ngrok.*(?:\.ya?ml|traffic.*policy.*\.json)$/i.test(
      file,
    )
  )
    issues.push({ file, rule: "敏感文件不应跟踪", source: "index" });
  if (existsSync(file))
    inspect(file, readFileSync(file).toString("utf8"), "worktree");
  inspect(
    file,
    execFileSync("git", ["show", `:${file}`], {
      maxBuffer: 20 * 1024 * 1024,
    }).toString("utf8"),
    "index",
  );
}
if (issues.length) {
  console.error(JSON.stringify({ ok: false, issues }, null, 2));
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      ok: true,
      trackedFiles: files.length,
      checked: [
        "工作区",
        "暂存内容",
        "敏感路径",
        "本机实际凭证",
        "配置模板",
        "常见凭证格式",
      ],
    }),
  );
