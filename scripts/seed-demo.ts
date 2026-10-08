import { Store } from "../apps/api/store";
import { Domain, addDay } from "../apps/api/domain";
// 独立演示库；不读取用户 DATABASE_PATH，不修改正式库。
const store = new Store("data/demo.sqlite"),
  d = new Domain(store);
try {
  if (!store.list("goal").length) {
    const g = d.goal({
      title: "[示例] 完成 React 实践",
      type: "学习",
      deadline: addDay(d.today(), 14),
      minutes: 120,
      criteria: "完成项目与总结",
      context: "演示数据",
    });
    d.task({
      title: "[示例] 阅读 Hooks 文档",
      goal: g.id,
      date: d.today(),
      minutes: 30,
    });
    d.habit({ name: "[示例] 阅读", target: "20分钟" });
  }
  console.log(
    JSON.stringify({ ok: true, database: "data/demo.sqlite", sample: true }),
  );
} finally {
  store.close();
}
