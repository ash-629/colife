// 覆盖 F01-F07 / P01-P07：正式业务页面，全部数据来自API。
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Form, Modal, Empty, Stat, Progress, type Field } from "./components";
import { agentInfo, statusLabels, runStages } from "../../../shared/contracts";
type Item = Record<string, any> & { id: string };
type Data = {
  version: number;
  today: string;
  settings: any;
  goals: Item[];
  tasks: Item[];
  habits: Item[];
  checkins: Item[];
  energies: Item[];
  focuses: Item[];
  notes: Item[];
  resources: Item[];
  routes: Item[];
  quizzes: Item[];
  runs: Item[];
  proposals: Item[];
  reviews: Item[];
  activities: Item[];
  modelConfigured: boolean;
};
const pages = [
  ["today", "◫", "今日工作台", "今天的每一步，都有方向。"],
  ["goals", "◎", "目标空间", "把愿望变成路线，让伙伴陪你走过每个里程碑。"],
  ["learning", "▤", "学习中心", "从学习路线到自我检验，每一步都有反馈。"],
  ["tasks", "▦", "任务与日程", "为重要的事留出时间，也为生活留一点弹性。"],
  ["life", "♧", "习惯与生活", "照顾生活，也是成长的一部分。"],
  ["agents", "✳", "Agent 协作", "五位伙伴，一个共同方向。"],
  ["review", "◷", "复盘与洞察", "回头看，是为了更好地向前。"],
];
const label = (s: string) => (statusLabels as Record<string, string>)[s] || s;
const nextDay = (d: string, n: number) => {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const dateLabel = (d: string) =>
  `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
export function App() {
  const [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState(location.hash.slice(1) || "today"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<{
      kind: string;
      id?: string;
      data?: any;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [view, setView] = useState("board"),
    [goalFilter, setGoalFilter] = useState("all"),
    [taskStatus, setTaskStatus] = useState("all"),
    [selectedGoal, setSelectedGoal] = useState(""),
    [quizDrafts, setQuizDrafts] = useState<
      Record<string, Record<number, number>>
    >({}),
    [week, setWeek] = useState(0),
    [period, setPeriod] = useState("today"),
    [stats, setStats] = useState<any>(null),
    [todayStats, setTodayStats] = useState<any>(null),
    [search, setSearch] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [searchStatus, setSearchStatus] = useState("idle"),
    [now, setNow] = useState(Date.now());
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const state = await api("/state");
      if (seq === requestSeq.current) {
        setData(state);
      }
    } catch (e) {
      if (seq === requestSeq.current) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    setError("");
  }, [modal?.kind, modal?.id]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 3000),
      clock = setInterval(() => setNow(Date.now()), 1000),
      hash = () => setPage(location.hash.slice(1) || "today");
    window.addEventListener("hashchange", hash);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("hashchange", hash);
    };
  }, [load]);
  const runAction = async (fn: () => Promise<any>, message = "已保存") => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await load();
      if (message) setToast(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const act = (fn: () => Promise<any>, message = "已保存") =>
    void runAction(fn, message).catch(() => {});
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!search.trim()) {
        setResults([]);
        setSearchStatus("idle");
        return;
      }
      api("/search?q=" + encodeURIComponent(search))
        .then((r) => {
          if (active) {
            setResults(r.results);
            setSearchStatus("idle");
          }
        })
        .catch(() => {
          if (active) {
            setResults([]);
            setSearchStatus("error");
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  const from = data
      ? period === "today"
        ? data.today
        : nextDay(
            data.today,
            -((new Date(data.today + "T12:00:00Z").getUTCDay() + 6) % 7),
          )
      : "",
    to = data ? (period === "today" ? data.today : nextDay(from, 6)) : "";
  useEffect(() => {
    if (data)
      api(`/stats?from=${from}&to=${to}`)
        .then((result) => {
          setStats(result);
          if (from === data.today && to === data.today) setTodayStats(result);
          else
            void api(`/stats?from=${data.today}&to=${data.today}`)
              .then(setTodayStats)
              .catch(() => {});
        })
        .catch(() => {});
  }, [data, from, to]);
  const nav = (p: string) => {
    location.hash = p;
    setPage(p);
    setSearch("");
    window.scrollTo(0, 0);
  };
  if (!data)
    return (
      <div className="loading-screen">
        <span className="brand-icon">co</span>
        <h1>同频 CoLife</h1>
        <p>{error || "正在连接你的个人空间…"}</p>
        {error && (
          <button className="btn" onClick={() => void load()}>
            重新连接
          </button>
        )}
      </div>
    );
  const today = data.tasks.filter((t) => t.date === data.today),
    done = today.filter((t) => t.status === "done"),
    energy = data.energies.find((e) => e.date === data.today)?.value || "一般",
    goalName = (id: string) =>
      data.goals.find((g) => g.id === id)?.title || "个人任务",
    isChecked = (id: string, date = data.today) =>
      data.checkins.some((c) => c.habit === id && c.date === date),
    progress = (id: string) => {
      const ts = data.tasks.filter((t) => t.goal === id);
      return ts.length
        ? Math.round(
            (ts.filter((t) => t.status === "done").length / ts.length) * 100,
          )
        : 0;
    };
  const goalOptions = [
    { value: "", label: "选择目标" },
    ...data.goals
      .filter((g) => !["completed", "archived"].includes(g.status))
      .map((g) => ({ value: g.id, label: g.title })),
  ];
  const start = async (kind: string, goal?: string) => {
    const r = await api("/runs", "POST", {
      kind,
      ...(goal ? { goal } : {}),
      ...(kind === "review" ? { from, to } : {}),
    });
    setModal({ kind: "run", id: r.id });
    return r;
  };
  const taskRow = (t: Item) => (
    <div className="task-row" key={t.id}>
      <button
        className={"check " + (t.status === "done" ? "checked" : "")}
        disabled={busy}
        aria-label={`${t.status === "done" ? "恢复" : "完成"} ${t.title}`}
        onClick={() =>
          act(
            () =>
              api("/tasks/" + t.id, "PATCH", {
                status: t.status === "done" ? "todo" : "done",
              }),
            "任务状态已更新",
          )
        }
      >
        {t.status === "done" ? "✓" : ""}
      </button>
      <div className="task-body">
        <button
          className={"task-title " + (t.status === "done" ? "done" : "")}
          onClick={() => setModal({ kind: "task", id: t.id })}
        >
          {t.title}
        </button>
        <div className="task-meta">
          {goalName(t.goal)} · {t.minutes} 分钟
        </div>
      </div>
      <span className={"tag " + (t.status === "doing" ? "orange" : "")}>
        {label(t.status)}
      </span>
    </div>
  );
  const habitsList = () =>
    data.habits.map((h) => (
      <div className="habit-row" key={h.id}>
        <span className="habit-icon">♧</span>
        <div className="task-body">
          <b>{h.name}</b>
          <small>{h.target}</small>
        </div>
        <button
          disabled={busy}
          className={"pill " + (isChecked(h.id) ? "done" : "")}
          onClick={() =>
            act(
              () =>
                api(
                  `/habits/${h.id}/checkin`,
                  isChecked(h.id) ? "DELETE" : "PUT",
                  { date: data.today },
                ),
              "习惯记录已更新",
            )
          }
        >
          {isChecked(h.id) ? "✓ 已打卡" : "打卡"}
        </button>
      </div>
    ));
  const button = (text: string, fn: () => void, secondary = false) => (
    <button
      className={"btn " + (secondary ? "secondary" : "")}
      onClick={fn}
      disabled={busy}
    >
      {text}
    </button>
  );
  const settingsForm = () => setModal({ kind: "settings" });
  const learningGoalId =
    data.goals.find((g) => g.id === selectedGoal && g.type === "学习")?.id ||
    data.goals.find((g) => g.type === "学习" && g.status !== "archived")?.id;
  const route = data.routes.filter((r) => r.goal === learningGoalId).at(-1);
  const renderPage = () => {
    if (page === "today")
      return (
        <>
          <section className="hero">
            <div>
              <div className="eyebrow">A LITTLE PROGRESS, EVERY DAY</div>
              <h2>你的目标，有一群伙伴同行。</h2>
              <p>
                学习、计划、生活与复盘，五位 Agent 协同工作。
                <br />
                你专注当下，我们一起照看前进的方向。
              </p>
              <small>
                真实数据 · {dateLabel(data.today)} · {data.settings.timezone}
              </small>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit" />
              <div className="orbit two" />
              <div className="orbit three">✳</div>
              <span className="planet a">▤</span>
              <span className="planet b">♧</span>
            </div>
          </section>
          <div className="stats">
            <Stat label="今日任务" value={`${done.length} / ${today.length}`} />
            <Stat
              label="今日专注"
              value={todayStats?.focusMinutes || 0}
              unit="分钟"
            />
            <Stat
              label="习惯达成"
              value={`${data.habits.filter((h) => isChecked(h.id)).length} / ${data.habits.length}`}
            />
            <Stat
              label="当前目标"
              value={
                data.goals.filter(
                  (g) => !["archived", "completed"].includes(g.status),
                ).length
              }
              unit="个"
            />
          </div>
          <div className="grid-two">
            <section className="card">
              <div className="section-head">
                <h2>今天，专注这些</h2>
                <button className="text-button" onClick={() => nav("tasks")}>
                  全部任务 →
                </button>
              </div>
              {today.length ? (
                today.map(taskRow)
              ) : (
                <Empty>今天还没有任务。创建一个目标或手动添加任务。</Empty>
              )}
              {button(
                "＋ 添加任务",
                () => setModal({ kind: "task-form" }),
                true,
              )}
            </section>
            <section className="card">
              <div className="section-head">
                <h2>给生活一点仪式感</h2>
              </div>
              {data.habits.length ? (
                habitsList()
              ) : (
                <Empty>从一个小习惯开始。</Empty>
              )}
              <div className="energy">
                今日精力
                <select
                  aria-label="今日精力"
                  value={energy}
                  onChange={(e) =>
                    act(
                      () =>
                        api("/energy", "PUT", {
                          date: data.today,
                          value: e.target.value,
                        }),
                      "精力已记录",
                    )
                  }
                >
                  {["充沛", "一般", "疲惫"].map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </div>
            </section>
          </div>
          <section className="card">
            <div className="section-head">
              <h2>正在靠近的目标</h2>
            </div>
            {data.goals
              .filter((g) => g.status !== "archived")
              .map((g) => (
                <div className="goal-mini" key={g.id}>
                  <div className="bottom">
                    <button
                      className="task-title"
                      onClick={() => setModal({ kind: "goal", id: g.id })}
                    >
                      {g.title}
                    </button>
                    <span className="tiny muted">{progress(g.id)}%</span>
                  </div>
                  <Progress value={progress(g.id)} />
                  <small>
                    {label(g.status)} · {dateLabel(g.deadline)}截止
                  </small>
                </div>
              ))}
          </section>
        </>
      );
    if (page === "goals")
      return (
        <>
          <div className="tabs">
            {["all", "draft", "pending", "active", "completed", "archived"].map(
              (f) => (
                <button
                  className={"tab " + (goalFilter === f ? "active" : "")}
                  onClick={() => setGoalFilter(f)}
                  key={f}
                >
                  {f === "all" ? "全部" : label(f)}
                </button>
              ),
            )}
          </div>
          <div className="cards-grid">
            {data.goals
              .filter((g) => goalFilter === "all" || g.status === goalFilter)
              .map((g) => (
                <article className="card goal-card" key={g.id}>
                  <div className="bottom">
                    <span className="tag">{g.type}目标</span>
                    <span className="tiny muted">{label(g.status)}</span>
                  </div>
                  <h2>{g.title}</h2>
                  <p>{g.criteria || "和伙伴一起定义验收标准。"}</p>
                  <Progress value={progress(g.id)} />
                  <div className="bottom">
                    <small>
                      {progress(g.id)}% · {dateLabel(g.deadline)}截止
                    </small>
                    <button
                      className="text-button"
                      onClick={() => setModal({ kind: "goal", id: g.id })}
                    >
                      查看路线 ↗
                    </button>
                  </div>
                </article>
              ))}
            <button
              className="new-card"
              onClick={() => setModal({ kind: "goal-form" })}
            >
              <span>＋</span>
              <b>开始一个新目标</b>
              <small>一个想法，就是起点。</small>
            </button>
          </div>
        </>
      );
    if (page === "tasks") {
      const ts = data.tasks.filter(
          (t) =>
            (!selectedGoal || t.goal === selectedGoal) &&
            (taskStatus === "all" || t.status === taskStatus),
        ),
        startDay = nextDay(
          data.today,
          -((new Date(data.today + "T12:00:00Z").getUTCDay() + 6) % 7) +
            week * 7,
        );
      return (
        <>
          <div className="toolbar">
            <div className="tabs">
              {["board", "calendar"].map((v) => (
                <button
                  key={v}
                  className={"tab " + (view === v ? "active" : "")}
                  onClick={() => setView(v)}
                >
                  {v === "board" ? "任务看板" : "周日历"}
                </button>
              ))}
            </div>
            <div className="chips">
              <select
                aria-label="筛选目标"
                value={selectedGoal}
                onChange={(e) => setSelectedGoal(e.target.value)}
              >
                <option value="">所有目标</option>
                {data.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="筛选状态"
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value)}
              >
                <option value="all">所有状态</option>
                {["todo", "doing", "done"].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
              {button(
                "✧ 重新排期",
                () =>
                  act(
                    () => start("reschedule", selectedGoal || undefined),
                    "已发起日程协作",
                  ),
                true,
              )}
            </div>
          </div>
          {view === "board" ? (
            <div className="kanban">
              {["todo", "doing", "done"].map((s) => (
                <section className="column" key={s}>
                  <div className="column-head">
                    <b>{label(s)}</b>
                    <span>{ts.filter((t) => t.status === s).length}</span>
                  </div>
                  {ts
                    .filter((t) => t.status === s)
                    .map((t) => (
                      <article className="task-card" key={t.id}>
                        <span className="tag">{t.priority}优先级</span>
                        <h3>
                          <button
                            className="task-title"
                            onClick={() => setModal({ kind: "task", id: t.id })}
                          >
                            {t.title}
                          </button>
                        </h3>
                        <p>{goalName(t.goal)}</p>
                        <div className="bottom">
                          <small>
                            {dateLabel(t.date)} · {t.minutes}m
                          </small>
                          <select
                            aria-label={`${t.title}的状态`}
                            value={t.status}
                            disabled={busy}
                            onChange={(e) =>
                              act(
                                () =>
                                  api("/tasks/" + t.id, "PATCH", {
                                    status: e.target.value,
                                  }),
                                "任务状态已更新",
                              )
                            }
                          >
                            {["todo", "doing", "done"].map((s) => (
                              <option key={s} value={s}>
                                {label(s)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </article>
                    ))}
                </section>
              ))}
            </div>
          ) : (
            <section className="card">
              <div className="section-head">
                <button onClick={() => setWeek(week - 1)}>← 上一周</button>
                <b>
                  {dateLabel(startDay)} — {dateLabel(nextDay(startDay, 6))}
                </b>
                <button onClick={() => setWeek(week + 1)}>下一周 →</button>
              </div>
              <div className="week-calendar">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = nextDay(startDay, i);
                  return (
                    <div
                      className={
                        "day-cell " + (d === data.today ? "today" : "")
                      }
                      key={d}
                    >
                      <div className="day-label">
                        {["一", "二", "三", "四", "五", "六", "日"][i]}
                        <b>{Number(d.slice(8))}</b>
                      </div>
                      {ts
                        .filter((t) => t.date === d)
                        .map((t) => (
                          <button
                            className={
                              "calendar-task " +
                              (t.status === "done" ? "done" : "")
                            }
                            key={t.id}
                            onClick={() => setModal({ kind: "task", id: t.id })}
                          >
                            {t.title}
                            <small>
                              {t.minutes}分钟 · {label(t.status)}
                            </small>
                          </button>
                        ))}
                      {data.settings.fixed
                        .filter((f: any) => f.date === d)
                        .map((f: any) => (
                          <div className="tag orange" key={f.id}>
                            {f.title} · {f.minutes}m
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      );
    }
    if (page === "learning") {
      const gid = learningGoalId;
      return (
        <>
          <div className="toolbar">
            <select
              aria-label="当前学习目标"
              value={gid || ""}
              onChange={(e) => setSelectedGoal(e.target.value)}
            >
              <option value="">选择学习目标</option>
              {data.goals
                .filter((g) => g.type === "学习")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
            {button("✧ 生成知识测验", () =>
              act(() => start("quiz", gid), "已发起知识测验协作"),
            )}
          </div>
          <div className="grid-two">
            <section className="card">
              <div className="section-head">
                <h2>当前学习路线</h2>
                <span className="tag purple">学习 Agent</span>
              </div>
              {route ? (
                route.stages.map((s: any, i: number) => (
                  <div className="route-step" key={i}>
                    <span className="step-index">{i + 1}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <Empty>为学习目标生成计划后，路线会出现在这里。</Empty>
              )}
            </section>
            <section className="card">
              <div className="section-head">
                <h2>知识反馈</h2>
              </div>
              {data.quizzes
                .filter((q) => q.goal === gid)
                .slice()
                .reverse()
                .map((q) => (
                  <div className="goal-mini" key={q.id}>
                    <b>
                      {q.result
                        ? `${q.result.score} / ${q.result.total} 分`
                        : "等待作答"}
                    </b>
                    <small>
                      {q.questions.length} 道题 ·{" "}
                      {new Date(q.createdAt).toLocaleDateString()}
                    </small>
                    <button
                      className="text-button"
                      onClick={() => setModal({ kind: "quiz", id: q.id })}
                    >
                      {q.result ? "查看反馈" : "开始答题"} →
                    </button>
                    {q.weaknesses?.length > 0 && (
                      <p className="tiny">薄弱点：{q.weaknesses.join("、")}</p>
                    )}
                  </div>
                ))}
              {!data.quizzes.some((q) => q.goal === gid) && (
                <Empty>一次小测，让理解更清晰。</Empty>
              )}
            </section>
          </div>
          <section className="card">
            <div className="section-head">
              <h2>关联执行任务</h2>
            </div>
            <p className="tiny muted">
              阶段路线为学习建议，执行日期以已确认的任务日程为准。
            </p>
            {data.tasks.filter((t) => t.goal === gid).length ? (
              data.tasks.filter((t) => t.goal === gid).map(taskRow)
            ) : (
              <Empty>确认计划后，关联任务会出现在这里。</Empty>
            )}
          </section>
          <section className="card">
            <div className="section-head">
              <h2>学习资料</h2>
              {button(
                "＋ 添加资料",
                () => setModal({ kind: "resource-form", data: { goal: gid } }),
                true,
              )}
            </div>
            <div className="resources">
              {data.resources
                .filter((r) => r.goal === gid)
                .map((r) => (
                  <div className="resource" key={r.id}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      <b>{r.title} ↗</b>
                      <small>{r.description}</small>
                    </a>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (confirm("删除这条资料？"))
                          act(() => api("/resources/" + r.id, "DELETE"));
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
            </div>
          </section>
          <section className="card">
            <div className="section-head">
              <h2>留下自己的理解</h2>
              {button(
                "＋ 写一条笔记",
                () => setModal({ kind: "note-form", data: { goal: gid } }),
                true,
              )}
            </div>
            {data.notes
              .filter((n) => n.goal === gid)
              .map((n) => (
                <div className="note" key={n.id}>
                  <div className="bottom">
                    <b>{n.title}</b>
                    <button
                      className="text-button"
                      onClick={() =>
                        setModal({ kind: "note-form", id: n.id, data: n })
                      }
                    >
                      编辑
                    </button>
                  </div>
                  {n.body}
                </div>
              ))}
          </section>
        </>
      );
    }
    if (page === "life") {
      const count = data.habits.filter((h) => isChecked(h.id)).length;
      return (
        <>
          <div className="stats">
            <Stat label="今日打卡" value={count} unit="项" />
            <Stat label="习惯总数" value={data.habits.length} unit="项" />
            <Stat
              label="今日达成"
              value={Math.round(
                (count / Math.max(data.habits.length, 1)) * 100,
              )}
              unit="%"
            />
            <Stat label="精力状态" value={energy} />
          </div>
          <div className="habit-cards">
            {data.habits.map((h) => {
              let streak = 0;
              let d = isChecked(h.id) ? data.today : nextDay(data.today, -1);
              while (isChecked(h.id, d)) {
                streak++;
                d = nextDay(d, -1);
              }
              return (
                <section className="card habit-card" key={h.id}>
                  <div className="habit-icon">♧</div>
                  <h2>{h.name}</h2>
                  <p>{h.target}</p>
                  <div className="week-dots">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = nextDay(data.today, i - 6);
                      return (
                        <div
                          key={d}
                          className={
                            "week-dot " + (isChecked(h.id, d) ? "active" : "")
                          }
                        >
                          {Number(d.slice(8))}
                          <i>{isChecked(h.id, d) ? "✓" : "·"}</i>
                        </div>
                      );
                    })}
                  </div>
                  <p>连续 {streak} 天</p>
                  {button(
                    isChecked(h.id) ? "✓ 已打卡 · 撤销" : "完成今天的打卡",
                    () =>
                      act(() =>
                        api(
                          `/habits/${h.id}/checkin`,
                          isChecked(h.id) ? "DELETE" : "PUT",
                          { date: data.today },
                        ),
                      ),
                    isChecked(h.id),
                  )}
                  <button
                    className="text-button"
                    onClick={() =>
                      setModal({ kind: "habit-form", id: h.id, data: h })
                    }
                  >
                    编辑习惯
                  </button>
                </section>
              );
            })}
          </div>
          <section className="card">
            <div className="section-head">
              <h2>今日精力记录</h2>
              <span className="tag orange">生活 Agent</span>
            </div>
            <div className="chips">
              {["充沛", "一般", "疲惫"].map((e) => (
                <button
                  className={"btn " + (energy === e ? "" : "secondary")}
                  key={e}
                  onClick={() =>
                    act(
                      () =>
                        api("/energy", "PUT", { date: data.today, value: e }),
                      "精力已记录",
                    )
                  }
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="insight">
              <p>记录精力不会直接改变日程。通过协作生成建议，审阅后再确认。</p>
              <button
                className="text-button"
                onClick={() => act(() => start("reschedule"), "已发起调整协作")}
              >
                查看调整建议 →
              </button>
            </div>
          </section>
        </>
      );
    }
    if (page === "agents")
      return (
        <>
          <div className="inline-info">
            DeepSeek ·{" "}
            {data.modelConfigured ? "已配置模型服务" : "模型服务未配置"} ·
            实际执行进度与产出由服务端保存。
          </div>
          <div className="agent-cards">
            {agentInfo.map((a) => (
              <section className="card agent-card" key={a.id}>
                <div className="section-head">
                  <div className="agent-role">
                    <span className="agent-avatar">{a.icon}</span>
                    <h3>{a.name}</h3>
                  </div>
                  <button
                    className={
                      "switch " + (data.settings.agents[a.id] ? "on" : "")
                    }
                    role="switch"
                    aria-label={"启用" + a.name}
                    aria-checked={data.settings.agents[a.id]}
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          api("/settings", "PUT", {
                            timezone: data.settings.timezone,
                            dailyMinutes: data.settings.dailyMinutes,
                            fixed: data.settings.fixed,
                            agents: {
                              ...data.settings.agents,
                              [a.id]: !data.settings.agents[a.id],
                            },
                          }),
                        "配置对后续运行生效",
                      )
                    }
                  >
                    <span />
                  </button>
                </div>
                <p>{a.desc}</p>
                <span className="tag">
                  {data.settings.agents[a.id] ? "已就绪" : "已暂停"}
                </span>
              </section>
            ))}
          </div>
          <section className="card" style={{ marginTop: 22 }}>
            <div className="section-head">
              <h2>协作运行记录</h2>
            </div>
            {data.runs.length ? (
              data.runs
                .slice()
                .reverse()
                .map((r) => (
                  <div className="run-log" key={r.id}>
                    <span className="agent-avatar">✳</span>
                    <div className="task-body">
                      <b>{r.title}</b>
                      <small>{new Date(r.createdAt).toLocaleString()}</small>
                      {r.error && <p className="error">{r.error}</p>}
                    </div>
                    <span className="tag">{label(r.status)}</span>
                    <button
                      className="text-button"
                      onClick={() => setModal({ kind: "run", id: r.id })}
                    >
                      查看
                    </button>
                  </div>
                ))
            ) : (
              <Empty>从一个目标开始第一次协作。</Empty>
            )}
          </section>
        </>
      );
    if (page === "review")
      return (
        <>
          <div className="tabs">
            {["today", "week"].map((p) => (
              <button
                key={p}
                className={"tab " + (period === p ? "active" : "")}
                onClick={() => setPeriod(p)}
              >
                {p === "today" ? "今日复盘" : "本周洞察"}
              </button>
            ))}
          </div>
          <div className="stats">
            <Stat
              label="计划完成率"
              value={stats?.completionRate || 0}
              unit="%"
              foot={`${stats?.scheduledDone || 0} / ${stats?.scheduled || 0} 个安排任务`}
            />
            <Stat label="实际完成" value={stats?.completed || 0} unit="项" />
            <Stat
              label="实际专注"
              value={stats?.focusMinutes || 0}
              unit="分钟"
            />
            <Stat label="习惯打卡" value={stats?.checkins || 0} unit="次" />
          </div>
          <div className="grid-two">
            <section className="card">
              <div className="section-head">
                <h2>从记录看见变化</h2>
                <span className="tag">真实记录</span>
              </div>
              <div className="chart">
                {stats?.trend?.map((t: any) => (
                  <div
                    className="bar-group"
                    key={t.date}
                    title={`${t.focusMinutes}分钟专注，${t.completed}项完成`}
                  >
                    <div className="bar">
                      <i
                        style={{ height: Math.min(t.focusMinutes, 120) + "px" }}
                      />
                      <i
                        className="alt"
                        style={{
                          height: Math.min(t.completed * 15, 120) + "px",
                        }}
                      />
                    </div>
                    <span>{Number(t.date.slice(8))}日</span>
                  </div>
                ))}
              </div>
              <div className="legend">
                <span>绿色：专注分钟</span>
                <span>米色：完成任务</span>
              </div>
              <p className="tiny" style={{ marginTop: 15 }}>
                柱高上限：120 分钟／8 项；悬停可查看实际值。
              </p>
            </section>
            <section className="card">
              <h2>计划与实际</h2>
              <div className="insight">
                <h3>预计安排 {stats?.plannedMinutes || 0} 分钟</h3>
                <p>
                  实际专注 {stats?.focusMinutes || 0}{" "}
                  分钟。计划耗时与实际记录分开统计。
                </p>
              </div>
              <p className="tiny" style={{ marginTop: 15 }}>
                统计范围：{from} — {to}
                <br />
                任务完成数按实际完成日期，计划完成率按安排日期。
              </p>
            </section>
          </div>
          <section className="card">
            <div className="section-head">
              <h2>复盘记录</h2>
            </div>
            {data.reviews.length ? (
              data.reviews
                .slice()
                .reverse()
                .map((r) => (
                  <div className="insight" key={r.id}>
                    <h3>
                      {r.from} — {r.to}
                    </h3>
                    <p>
                      生成时事实：{r.facts.completed}项实际完成，
                      {r.facts.focusMinutes}分钟专注。
                    </p>
                    <h4>原因分析与推测</h4>
                    <div className="note">{r.analysis}</div>
                    <div className="chips" style={{ marginTop: 12 }}>
                      {r.suggestions.map((s: string, i: number) => (
                        <span className="tag" key={i}>
                          {s}
                        </span>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        setModal({ kind: "proposal", id: r.proposal })
                      }
                    >
                      查看调整提案 →
                    </button>
                  </div>
                ))
            ) : (
              <Empty>记录执行后，生成一份有依据的复盘。</Empty>
            )}
          </section>
        </>
      );
    return <Empty>页面不存在。</Empty>;
  };
  const renderModal = () => {
    if (!modal) return null;
    const m = modal;
    const saveForm = async (path: string, value: any, method = "POST") => {
      await runAction(() => api(path, method, value));
      setModal(null);
    };
    if (
      [
        "goal-form",
        "task-form",
        "note-form",
        "habit-form",
        "resource-form",
      ].includes(m.kind)
    ) {
      let fields: Field[] = [],
        title = "",
        endpoint = "",
        value = m.data || {},
        method = m.id ? "PATCH" : "POST";
      if (m.kind === "goal-form") {
        const g = m.id ? data.goals.find((g) => g.id === m.id) : value;
        title = m.id ? "编辑目标" : "从一个目标开始";
        endpoint = "/goals";
        fields = [
          {
            name: "title",
            label: "目标名称",
            required: true,
            max: 60,
            value: g?.title,
          },
          {
            name: "type",
            label: "类型",
            value: g?.type || "学习",
            options: ["学习", "生活"].map((x) => ({ value: x, label: x })),
          },
          {
            name: "deadline",
            label: "截止日期",
            type: "date",
            required: true,
            value: g?.deadline || nextDay(data.today, 14),
          },
          {
            name: "minutes",
            label: "每日可用分钟",
            type: "number",
            min: 15,
            max: 480,
            required: true,
            value: g?.minutes || 120,
          },
          { name: "criteria", label: "验收标准", max: 300, value: g?.criteria },
          {
            name: "context",
            label: "背景与时间限制",
            type: "textarea",
            max: 500,
            value: g?.context,
          },
        ];
      }
      if (m.kind === "task-form") {
        const t = m.id ? data.tasks.find((t) => t.id === m.id) : value;
        title = m.id ? "编辑任务" : "添加一件要做的事";
        endpoint = "/tasks";
        fields = [
          {
            name: "title",
            label: "任务名称",
            required: true,
            max: 80,
            value: t?.title,
          },
          {
            name: "goal",
            label: "关联目标",
            options: [
              { value: "", label: "个人任务" },
              ...goalOptions.slice(1),
            ],
            value: t?.goal || selectedGoal,
          },
          {
            name: "date",
            label: "日期",
            type: "date",
            required: true,
            value: t?.date || data.today,
          },
          {
            name: "minutes",
            label: "预计分钟",
            type: "number",
            min: 1,
            max: 480,
            required: true,
            value: t?.minutes || 30,
          },
          {
            name: "priority",
            label: "优先级",
            options: ["中", "高", "低"].map((x) => ({ value: x, label: x })),
            value: t?.priority || "中",
          },
          {
            name: "note",
            label: "任务备注",
            type: "textarea",
            max: 2000,
            value: t?.note,
          },
          {
            name: "dependencies",
            label: "依赖任务（可多选）",
            type: "multiselect",
            options: data.tasks
              .filter((x) => x.id !== m.id)
              .map((x) => ({ value: x.id, label: x.title })),
            value: t?.dependencies || [],
          },
        ];
      }
      if (m.kind === "note-form") {
        title = "写下自己的理解";
        endpoint = "/notes";
        fields = [
          {
            name: "goal",
            label: "关联目标",
            options: goalOptions,
            value: value.goal || selectedGoal,
          },
          {
            name: "title",
            label: "笔记标题",
            required: true,
            max: 60,
            value: value.title,
          },
          {
            name: "body",
            label: "正文",
            type: "textarea",
            required: true,
            max: 2000,
            value: value.body,
          },
        ];
      }
      if (m.kind === "habit-form") {
        title = "一个小习惯";
        endpoint = "/habits";
        fields = [
          {
            name: "name",
            label: "习惯名称",
            required: true,
            max: 30,
            value: value.name,
          },
          {
            name: "target",
            label: "每日目标",
            required: true,
            max: 60,
            value: value.target,
          },
        ];
      }
      if (m.kind === "resource-form") {
        title = "保存一条学习资料";
        endpoint = "/resources";
        fields = [
          {
            name: "goal",
            label: "关联目标",
            options: goalOptions,
            value: value.goal,
          },
          { name: "title", label: "资料标题", required: true, max: 100 },
          { name: "url", label: "网址", type: "url", required: true },
          {
            name: "description",
            label: "资料说明",
            type: "textarea",
            max: 500,
          },
        ];
      }
      return (
        <Modal error={error} title={title} onClose={() => setModal(null)}>
          <Form
            fields={fields}
            onSubmit={async (v) => {
              await saveForm(endpoint + (m.id ? "/" + m.id : ""), v, method);
            }}
          />
        </Modal>
      );
    }
    if (m.kind === "settings")
      return (
        <Modal
          error={error}
          title="个人时间与固定安排"
          onClose={() => setModal(null)}
        >
          <p className="modal-desc">
            固定安排按日期占用分钟容量，计划会保护这些时间。
          </p>
          <Form
            fields={[
              {
                name: "timezone",
                label: "时区",
                value: data.settings.timezone,
                required: true,
              },
              {
                name: "dailyMinutes",
                label: "每日总可用分钟",
                type: "number",
                min: 15,
                max: 960,
                required: true,
                value: data.settings.dailyMinutes,
              },
              {
                name: "fixedText",
                label: "固定安排（每行：日期,分钟,标题）",
                type: "textarea",
                value: data.settings.fixed
                  .map((f: any) => `${f.date},${f.minutes},${f.title}`)
                  .join("\n"),
              },
            ]}
            onSubmit={async (v) => {
              const fixed = String(v.fixedText || "")
                .split("\n")
                .filter((s) => s.trim())
                .map((s, i) => {
                  const [date, minutes, ...title] = s.split(",");
                  return {
                    id: String(i),
                    date: date.trim(),
                    minutes: Number(minutes),
                    title: title.join(",").trim(),
                  };
                });
              await saveForm(
                "/settings",
                {
                  timezone: v.timezone,
                  dailyMinutes: v.dailyMinutes,
                  fixed,
                  agents: data.settings.agents,
                },
                "PUT",
              );
            }}
          />
        </Modal>
      );
    if (m.kind === "goal") {
      const g = data.goals.find((g) => g.id === m.id);
      if (!g) return null;
      return (
        <Modal error={error} title={g.title} onClose={() => setModal(null)}>
          <span className="tag">{label(g.status)}</span>
          <Progress value={progress(g.id)} />
          <div className="inline-info">
            验收标准：{g.criteria || "尚未填写"}
            <br />
            背景：{g.context || "暂无额外限制"}
            <br />
            {dateLabel(g.deadline)}截止 · 每日{g.minutes}分钟
          </div>
          {data.tasks.filter((t) => t.goal === g.id).map(taskRow)}
          <div className="chips">
            {button("生成学习生活计划", () =>
              act(() => start("plan", g.id), "已发起协作"),
            )}
            {button(
              "编辑",
              () => setModal({ kind: "goal-form", id: g.id }),
              true,
            )}
            {button(
              "确认目标验收",
              () => {
                if (confirm("确认已达到验收标准？"))
                  act(
                    () =>
                      api("/goals/" + g.id, "PATCH", { status: "completed" }),
                    "目标已验收",
                  );
              },
              true,
            )}
            {button(
              "归档",
              () =>
                act(
                  () => api("/goals/" + g.id, "PATCH", { status: "archived" }),
                  "目标已归档",
                ),
              true,
            )}
          </div>
        </Modal>
      );
    }
    if (m.kind === "task") {
      const t = data.tasks.find((t) => t.id === m.id);
      if (!t) return null;
      return (
        <Modal error={error} title={t.title} onClose={() => setModal(null)}>
          <div className="chips">
            <span className="tag">{label(t.status)}</span>
            <span className="tag orange">{t.priority}优先级</span>
            <span className="tag gray">{t.minutes}分钟</span>
          </div>
          <div className="inline-info">
            {t.note || "先做一个小步骤，再记录你的收获。"}
            <br />
            关联：{goalName(t.goal)} · {t.date}
          </div>
          <small>
            依赖：
            {t.dependencies
              ?.map((id: string) => data.tasks.find((t) => t.id === id)?.title)
              .join("、") || "无"}
            <br />
            来源：{t.source}
          </small>
          <div className="modal-footer">
            {button(
              "开始专注",
              () =>
                act(async () => {
                  const f = await api("/focus", "POST", { task: t.id });
                  setModal({ kind: "focus", id: f.id });
                }, "已开始专注"),
              true,
            )}
            {button(
              "编辑",
              () => setModal({ kind: "task-form", id: t.id }),
              true,
            )}
            {button(t.status === "done" ? "恢复待办" : "标记完成", () =>
              act(
                () =>
                  api("/tasks/" + t.id, "PATCH", {
                    status: t.status === "done" ? "todo" : "done",
                  }),
                "状态已更新",
              ),
            )}
          </div>
          <button
            className="text-button"
            onClick={() => {
              if (confirm("确认删除这条未完成任务？"))
                act(async () => {
                  await api("/tasks/" + t.id, "DELETE");
                  setModal(null);
                }, "任务已删除");
            }}
          >
            删除任务
          </button>
        </Modal>
      );
    }
    if (m.kind === "run") {
      const r = data.runs.find((r) => r.id === m.id);
      return (
        <Modal
          error={error}
          title="伙伴正在一起想办法"
          onClose={() => setModal(null)}
        >
          {r ? (
            <>
              <p className="modal-desc">
                {r.title} · {label(r.status)}
              </p>
              <p className="modal-desc">
                {r.orchestration === "parallel-v1"
                  ? r.kind === "quiz"
                    ? "协调分派后，学习 Agent 生成测验。"
                    : "学习与生活 Agent 同时分析，后续角色等待完整产出再继续。"
                  : "此记录采用顺序执行；新发起的协作支持并行分析。"}
              </p>
              {(r.orchestration === "parallel-v1"
                ? runStages(r.kind)
                : r.nodes.map((n: any) => [n.agent])
              ).map((stage: string[], index: number) => (
                <section className="run-stage" key={index}>
                  <div className="run-stage-heading">
                    <b>阶段 {index + 1}</b>
                    <span className="tag">
                      {stage.length > 1 ? "并行分析" : "依次衔接"}
                    </span>
                  </div>
                  <div
                    className={
                      "run-stage-nodes" + (stage.length > 1 ? " parallel" : "")
                    }
                  >
                    {stage
                      .map((agent: string) =>
                        r.nodes.find((n: any) => n.agent === agent),
                      )
                      .filter(Boolean)
                      .map((n: any) => (
                        <div className="run-log" key={n.agent}>
                          <span className="agent-avatar">
                            {agentInfo.find((a) => a.id === n.agent)?.icon}
                          </span>
                          <div className="task-body">
                            <b>
                              {agentInfo.find((a) => a.id === n.agent)?.name}
                            </b>
                            <p>
                              {n.error ||
                                n.summary ||
                                (n.status === "running"
                                  ? "正在分析…"
                                  : "等待上游产出")}
                            </p>
                            <small>
                              {n.finishedAt
                                ? (n.startedAt
                                    ? new Date(
                                        n.startedAt,
                                      ).toLocaleTimeString() + " → "
                                    : "") +
                                  new Date(n.finishedAt).toLocaleTimeString()
                                : n.startedAt
                                  ? "开始于 " +
                                    new Date(n.startedAt).toLocaleTimeString()
                                  : ""}
                            </small>
                          </div>
                          <span className={"run-state " + n.status}>
                            {label(n.status)}
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
              {r.error && <p className="error">{r.error}</p>}
              <div className="modal-footer">
                {["queued", "running"].includes(r.status) &&
                  button(
                    "取消运行",
                    () =>
                      act(
                        () => api(`/runs/${r.id}/cancel`, "POST"),
                        "运行已取消",
                      ),
                    true,
                  )}
                {r.status === "failed" &&
                  button("重试失败节点", () =>
                    act(() => api(`/runs/${r.id}/retry`, "POST"), "已发起重试"),
                  )}
                {r.proposal &&
                  button("审阅提案", () =>
                    setModal({ kind: "proposal", id: r.proposal }),
                  )}
                {r.quiz &&
                  button("开始测验", () =>
                    setModal({ kind: "quiz", id: r.quiz }),
                  )}
              </div>
            </>
          ) : (
            <p>正在读取协作状态…</p>
          )}
        </Modal>
      );
    }
    if (m.kind === "proposal") {
      const p = data.proposals.find((p) => p.id === m.id);
      if (!p) return null;
      const stale = p.status === "pending" && p.baseVersion !== data.version;
      const regenerate = () =>
        act(async () => {
          if (p.quiz) {
            const updated = await api(`/quizzes/${p.quiz}/revision`, "POST");
            setModal({ kind: "proposal", id: updated.id });
          } else {
            const r = data.runs.find((r) => r.id === p.run);
            const run = await api("/runs", "POST", {
              kind: r?.kind || "reschedule",
              ...(r?.goal ? { goal: r.goal } : {}),
              ...(r?.kind === "review" ? { from: r.from, to: r.to } : {}),
            });
            setModal({ kind: "run", id: run.id });
          }
        }, "已重新生成");
      return (
        <Modal
          error={error}
          title="计划准备好了，由你决定"
          onClose={() => setModal(null)}
        >
          <span className="tag">{label(stale ? "stale" : p.status)}</span>
          {stale && (
            <p className="error">记录已变化，请根据最新日程重新生成。</p>
          )}
          {p.status === "rejected" && (
            <p className="inline-info" role="status">
              这份提案已选择保留原计划，尚未写入日程。若希望采用建议，请根据最新记录重新生成提案，审阅后确认并应用。
            </p>
          )}
          <h3>建议理由</h3>
          <div className="inline-info">{p.reason}</div>
          {p.tasks.map((t: any, i: number) => (
            <div className="proposal-task" key={i}>
              <b>{t.title}</b>
              <small>
                {t.date} · {t.minutes}分钟 · {t.priority}优先级
              </small>
            </div>
          ))}
          {p.moves.map((m: any, i: number) => (
            <div className="proposal-task" key={"move" + i}>
              <b>{data.tasks.find((t) => t.id === m.taskId)?.title}</b>
              <small>
                {m.beforeDate ||
                  (p.status === "applied"
                    ? "原日期"
                    : data.tasks.find((t) => t.id === m.taskId)?.date)}{" "}
                → {m.date}
              </small>
              <small>{m.reason}</small>
            </div>
          ))}
          {!p.tasks.length && !p.moves.length && (
            <Empty>当前无需调整执行任务。</Empty>
          )}
          <p className="tiny muted">
            应用时会再次检查容量、日期与依赖；数据变化后需重新生成。
          </p>
          <div className="modal-footer">
            {p.status === "pending" && (
              <>
                {button(
                  "保留原计划",
                  () =>
                    act(async () => {
                      await api(`/proposals/${p.id}/reject`, "POST");
                      setModal(null);
                    }, "已保留原计划"),
                  true,
                )}
                {!stale &&
                  button("确认并应用", () =>
                    act(async () => {
                      await api(`/proposals/${p.id}/apply`, "POST");
                      setModal(null);
                      nav("tasks");
                    }, "计划已加入日程"),
                  )}
                {stale && button("重新生成提案", regenerate)}
              </>
            )}
            {p.status === "rejected" && button("重新生成提案", regenerate)}
          </div>
        </Modal>
      );
    }
    if (m.kind === "quiz") {
      const q = data.quizzes.find((q) => q.id === m.id);
      if (!q) return null;
      return (
        <Modal
          error={error}
          title={q.result ? "每一次反馈，都让理解更清晰" : "检验自己的理解"}
          onClose={() => setModal(null)}
        >
          {q.result ? (
            <>
              <h2>
                {q.result.score} / {q.result.total} 分
              </h2>
              {q.questions.map((x: any, i: number) => (
                <div className="quiz-question" key={i}>
                  <h3>
                    {i + 1}. {x.question}
                  </h3>
                  <p className="tiny">你的答案：{x.options[q.answers[i]]}</p>
                  <div className="answer">
                    正确答案：{x.options[x.correct]}
                    <br />
                    {x.explanation}
                  </div>
                </div>
              ))}
              {q.result.score < q.result.total &&
                button("生成复习提案", () =>
                  act(async () => {
                    const p = await api(`/quizzes/${q.id}/revision`, "POST");
                    setModal({ kind: "proposal", id: p.id });
                  }, "复习提案已准备"),
                )}
            </>
          ) : (
            <form
              data-dirty={Object.keys(quizDrafts[q.id] || {}).length > 0}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act(
                  () =>
                    api(`/quizzes/${q.id}/submit`, "POST", {
                      answers: q.questions.map((_: any, i: number) =>
                        Number(f.get("q" + i)),
                      ),
                    }),
                  "测验已提交",
                );
              }}
            >
              {q.questions.map((x: any, i: number) => (
                <div className="quiz-question" key={i}>
                  <h3>
                    {i + 1}. {x.question}
                  </h3>
                  {x.options.map((s: string, j: number) => (
                    <label className="quiz-option" key={j}>
                      <input
                        type="radio"
                        name={"q" + i}
                        value={j}
                        required
                        checked={quizDrafts[q.id]?.[i] === j}
                        onChange={() =>
                          setQuizDrafts((drafts) => ({
                            ...drafts,
                            [q.id]: { ...drafts[q.id], [i]: j },
                          }))
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
              ))}
              <div className="modal-footer">
                <button className="btn" disabled={busy}>
                  提交并查看反馈
                </button>
              </div>
            </form>
          )}
        </Modal>
      );
    }
    if (m.kind === "focus") {
      const f = data.focuses.find((f) => f.id === m.id);
      if (!f) return null;
      const elapsed = Math.min(
          1500,
          f.elapsedSeconds +
            (f.status === "running"
              ? Math.max(0, Math.floor((now - f.resumedAt) / 1000))
              : 0),
        ),
        left = Math.max(0, 1500 - elapsed);
      return (
        <Modal
          error={error}
          title="给当下，一段完整的时间"
          onClose={() => setModal(null)}
        >
          <p>{data.tasks.find((t) => t.id === f.task)?.title}</p>
          <div className="timer">
            {String(Math.floor(left / 60)).padStart(2, "0")}:
            {String(left % 60).padStart(2, "0")}
          </div>
          <p className="tiny muted">
            计时由服务端保存；关闭窗口不会自动结束专注，可从顶部入口继续。
          </p>
          <div className="modal-footer">
            {f.status !== "finished" && (
              <>
                {button(
                  f.status === "running" ? "暂停" : "继续",
                  () =>
                    act(
                      () =>
                        api(
                          `/focus/${f.id}/${f.status === "running" ? "pause" : "resume"}`,
                          "POST",
                        ),
                      "专注状态已更新",
                    ),
                  true,
                )}
                {button("结束并记录", () =>
                  act(async () => {
                    await api(`/focus/${f.id}/finish`, "POST");
                    setModal(null);
                  }, "专注已记录"),
                )}
              </>
            )}
          </div>
        </Modal>
      );
    }
    return null;
  };
  const active = pages.find((p) => p[0] === page) || pages[0],
    activeFocus = data.focuses.find((f) => f.status !== "finished");
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#today">
          <span className="brand-icon">co</span>
          <span>
            CoLife<small>同频 · 个人成长空间</small>
          </span>
        </a>
        <div className="workspace">
          <span className="avatar">我</span>
          <div>
            我的个人空间<small>PERSONAL WORKSPACE</small>
          </div>
        </div>
        <div className="nav-caption">我的空间</div>
        <nav aria-label="主要导航">
          {pages.map(([p, icon, title]) => (
            <a
              key={p}
              href={"#" + p}
              className={p === page ? "active" : ""}
              aria-label={title}
              aria-current={p === page ? "page" : undefined}
            >
              <span className="nav-icon">{icon}</span>
              <span>{title}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-orbit">✳</div>
          <b>让每一小步，都有方向。</b>
          <p>
            把规划交给同伴，
            <br />
            把成长留给自己。
          </p>
          <button className="text-button" onClick={settingsForm}>
            个人时间与固定安排 ↗
          </button>
          <div className="profile">
            <span className="avatar">我</span>
            <div>
              个人空间<small>{data.settings.timezone}</small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            我的空间 <span>/</span>
            <strong>{active[2]}</strong>
          </div>
          <div className="top-actions">
            <label className="search-wrap">
              <span>⌕</span>
              <input
                aria-label="搜索目标和任务"
                placeholder="搜索目标、任务…"
                value={search}
                onChange={(e) => {
                  setSearchStatus("loading");
                  setSearch(e.target.value);
                }}
              />
            </label>
            {activeFocus && (
              <button
                className="text-button"
                onClick={() => setModal({ kind: "focus", id: activeFocus.id })}
              >
                ◷ 继续专注
              </button>
            )}
            <button
              className="text-button mobile-settings"
              onClick={settingsForm}
            >
              时间设置
            </button>
            <span className="demo-badge">个人空间</span>
          </div>
          {search && (
            <div className="search-results">
              {searchStatus === "loading" ? (
                <p>正在搜索…</p>
              ) : searchStatus === "error" ? (
                <p role="alert">搜索失败，请重新输入后重试。</p>
              ) : results.length ? (
                results.map((r) => (
                  <button
                    key={r.kind + r.id}
                    onClick={() => {
                      setSearch("");
                      setModal({ kind: r.kind, id: r.id });
                    }}
                  >
                    <small>{r.kind === "task" ? "任务" : "目标"}</small>
                    {r.title}
                  </button>
                ))
              ) : (
                <Empty>没有找到匹配结果</Empty>
              )}
            </div>
          )}
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="关闭错误提示">
              ×
            </button>
          </div>
        )}
        <div className="body-layout">
          <main>
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR PERSONAL GROWTH SPACE</div>
                <h1>{page === "today" ? "今天，也在慢慢前进" : active[2]}</h1>
                <p>{active[3]}</p>
              </div>
              {page === "today" || page === "goals"
                ? button("＋ 新建目标", () => setModal({ kind: "goal-form" }))
                : page === "tasks"
                  ? button("＋ 添加任务", () => setModal({ kind: "task-form" }))
                  : page === "life"
                    ? button("＋ 添加习惯", () =>
                        setModal({ kind: "habit-form" }),
                      )
                    : page === "review"
                      ? button("✧ 生成复盘", () =>
                          act(() => start("review"), "已发起复盘协作"),
                        )
                      : page === "agents"
                        ? button("✳ 发起协作", () =>
                            setModal({ kind: "launch" }),
                          )
                        : null}
            </div>
            {renderPage()}
            <div className="footer-note">让成长与生活同频。</div>
          </main>
          <aside className="copilot">
            <div className="copilot-head">
              <h2>你的协作伙伴</h2>
              <span className="live">
                ● {Object.values(data.settings.agents).filter(Boolean).length}
                位就绪
              </span>
            </div>
            <p>各有所长，朝着同一个方向。</p>
            {agentInfo.map((a) => (
              <div className="agent-item" key={a.id}>
                <span className="agent-avatar">{a.icon}</span>
                <div>
                  <b>{a.name}</b>
                  <small>
                    {data.settings.agents[a.id] ? a.desc : "已暂停参与协作"}
                  </small>
                </div>
              </div>
            ))}
            <div className="agent-message">
              <b>✧ 今天的节奏</b>
              <p>
                {energy === "疲惫"
                  ? "给重点留时间，也给自己留休息。"
                  : "先做一个小步骤，再把收获记录下来。"}
              </p>
              <button className="btn subtle" onClick={() => nav("agents")}>
                查看协作中心 →
              </button>
            </div>
            <div className="rail-title">最近的活动</div>
            {data.activities
              .slice(-4)
              .reverse()
              .map((a) => (
                <div className="activity" key={a.id}>
                  {a.text}
                  <small>{new Date(a.time).toLocaleTimeString()}</small>
                </div>
              ))}
            <div className="rail-footer">
              {data.modelConfigured ? "DeepSeek 服务已配置" : "模型服务未配置"}
              <br />
              数据保存在本机数据库。
            </div>
          </aside>
        </div>
      </div>
      {modal?.kind === "launch" ? (
        <Modal
          error={error}
          title="发起一次协作"
          onClose={() => setModal(null)}
        >
          <Form
            fields={[
              {
                name: "kind",
                label: "协作类型",
                value: "plan",
                options: [
                  { value: "plan", label: "制定计划" },
                  { value: "quiz", label: "知识测验" },
                  { value: "reschedule", label: "重新排期" },
                  { value: "review", label: "执行复盘" },
                ],
              },
              { name: "goal", label: "关联目标", options: goalOptions },
            ]}
            label="开始协作"
            onSubmit={async (v) => {
              await runAction(
                () => start(v.kind, v.goal || undefined),
                "已发起协作",
              );
            }}
          />
        </Modal>
      ) : (
        renderModal()
      )}
      <div role="status" className={"toast " + (toast ? "show" : "")}>
        {toast}
      </div>
    </div>
  );
}
