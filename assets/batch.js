const BATCH_TASK_PAGES = [
  { key: "optimization", label: "优化调度任务", empty: "暂无优化调度任务。" },
  { key: "verification", label: "方案校核任务", empty: "暂无方案校核任务。" },
  { key: "all", label: "全部任务", empty: "暂无任务。" },
];

const batchState = {
  tasks: [],
  activeTaskType: "optimization",
  schemeFilter: "",
  timer: 0,
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshTasks")?.addEventListener("click", loadBatchTasks);
  document.getElementById("batchTaskTabs")?.addEventListener("click", handleTaskPageClick);
  document.getElementById("batchTaskTable")?.addEventListener("click", handleTaskAction);
  document.getElementById("batchSchemeFilter")?.addEventListener("change", (event) => {
    batchState.schemeFilter = event.target.value || "";
    renderBatchTasks();
  });
  loadBatchTasks().catch(showBatchError);
  batchState.timer = window.setInterval(loadBatchTasks, 4000);
  window.addEventListener("beforeunload", () => window.clearInterval(batchState.timer));
});

async function loadBatchTasks() {
  const payload = await api("/api/task-board");
  batchState.tasks = payload.tasks || [];
  normalizeSchemeFilter();
  renderBatchTasks();
  setError("batchError", "");
}

function handleTaskPageClick(event) {
  const button = event.target?.closest?.("[data-task-page]");
  if (!button) return;
  switchTaskPage(button.dataset.taskPage || "optimization");
}

function switchTaskPage(taskType) {
  if (!BATCH_TASK_PAGES.some((page) => page.key === taskType)) return;
  batchState.activeTaskType = taskType;
  if (taskType === "optimization") {
    batchState.schemeFilter = "";
  }
  normalizeSchemeFilter();
  renderBatchTasks();
}

function normalizeSchemeFilter() {
  if (!batchState.schemeFilter) return;
  const schemes = new Set(batchState.tasks.map((task) => task.scheme).filter(Boolean));
  if (!schemes.has(batchState.schemeFilter)) {
    batchState.schemeFilter = "";
  }
}

function renderBatchTasks() {
  renderTaskTabs();
  renderBatchHeader();
  renderSchemeFilter();
  renderBatchSummary();
  renderTaskTable();
}

function renderTaskTabs() {
  const target = document.getElementById("batchTaskTabs");
  if (!target) return;
  const counts = {
    optimization: batchState.tasks.filter((task) => task.task_type_key === "optimization").length,
    verification: batchState.tasks.filter((task) => task.task_type_key === "verification").length,
    all: batchState.tasks.length,
  };
  target.innerHTML = BATCH_TASK_PAGES.map((page) => {
    const active = page.key === batchState.activeTaskType;
    return `
      <button class="batch-tab ${active ? "active" : ""}" type="button" data-task-page="${escapeHtml(page.key)}" role="tab" aria-selected="${active}">
        <span>${escapeHtml(page.label)}</span><strong>${counts[page.key] || 0}</strong>
      </button>
    `;
  }).join("");
}

function renderBatchHeader() {
  const title = document.getElementById("batchTaskTitle");
  const updated = document.getElementById("batchLastUpdated");
  const page = pageConfig(batchState.activeTaskType);
  if (title) title.textContent = page.label;
  if (updated) updated.textContent = `最新刷新 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
}

function renderSchemeFilter() {
  const wrap = document.getElementById("batchSchemeFilterWrap");
  const select = document.getElementById("batchSchemeFilter");
  if (!wrap || !select) return;
  const visible = batchState.activeTaskType !== "optimization";
  wrap.hidden = !visible;
  if (!visible) return;
  const schemes = [...new Set(batchState.tasks.map((task) => task.scheme).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  select.innerHTML = [
    `<option value="">全部方案</option>`,
    ...schemes.map((scheme) => `<option value="${escapeHtml(scheme)}" ${scheme === batchState.schemeFilter ? "selected" : ""}>${escapeHtml(scheme)}</option>`),
  ].join("");
}

function renderBatchSummary() {
  const target = document.getElementById("batchSummary");
  if (!target) return;
  const tasks = filteredTasks();
  const counts = {
    total: tasks.length,
    running: tasks.filter((task) => ["准备启动", "计算中", "校核中"].includes(task.status)).length,
    queued: tasks.filter((task) => task.status === "排队中").length,
    done: tasks.filter((task) => ["完成计算", "完成校核"].includes(task.status)).length,
    failed: tasks.filter((task) => ["计算失败", "计算中止", "校核失败", "校核中止", "退出队列"].includes(task.status)).length,
  };
  target.innerHTML = `
    <span><em>任务</em><strong>${counts.total}</strong></span>
    <span><em>运行</em><strong>${counts.running}</strong></span>
    <span><em>排队</em><strong>${counts.queued}</strong></span>
    <span><em>完成</em><strong>${counts.done}</strong></span>
    <span><em>异常</em><strong>${counts.failed}</strong></span>
  `;
}

function renderTaskTable() {
  const target = document.getElementById("batchTaskTable");
  if (!target) return;
  const tasks = filteredTasks();
  if (!tasks.length) {
    target.innerHTML = `<div class="batch-empty">${escapeHtml(pageConfig(batchState.activeTaskType).empty)}</div>`;
    return;
  }
  target.innerHTML = `
    <table class="batch-task-table">
      <thead>
        <tr>
          <th class="batch-col-scheme">任务所用方案</th>
          <th class="batch-col-result">任务所用结果</th>
          <th class="batch-col-actions">操作</th>
          <th class="batch-col-status">任务状态</th>
          <th class="batch-col-process">进程号</th>
          <th class="batch-col-time">计算开始时刻</th>
          <th class="batch-col-time">计算结束时刻</th>
          <th class="batch-col-elapsed">计算总用时(秒)</th>
          <th class="batch-col-log">最新更新日志</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(renderTaskRow).join("")}
      </tbody>
    </table>
  `;
}

function filteredTasks() {
  return batchState.tasks
    .filter((task) => batchState.activeTaskType === "all" || task.task_type_key === batchState.activeTaskType)
    .filter((task) => !batchState.schemeFilter || task.scheme === batchState.schemeFilter);
}

function renderTaskRow(task) {
  return `
    <tr>
      <td>
        <div class="batch-cell-main">${escapeHtml(task.scheme || "-")}</div>
        <div class="batch-cell-sub">${escapeHtml(task.scheme_description || task.task_type || "-")}</div>
      </td>
      <td>
        <div class="batch-cell-main">${escapeHtml(task.result_name || defaultResultName(task))}</div>
        <div class="batch-cell-sub">${escapeHtml(task.task_type || "-")}</div>
      </td>
      <td class="batch-actions-cell">
        <div class="batch-row-actions">
          <button class="primary small" type="button" data-task-action="start" data-task-type="${escapeHtml(task.task_type_key)}" data-scheme="${escapeHtml(task.scheme)}" ${task.can_start ? "" : "disabled"}>启动</button>
          <button class="small" type="button" data-task-action="queue" data-task-type="${escapeHtml(task.task_type_key)}" data-scheme="${escapeHtml(task.scheme)}" ${task.can_queue ? "" : "disabled"}>排队</button>
          <button class="danger small" type="button" data-task-action="stop" data-task-type="${escapeHtml(task.task_type_key)}" data-scheme="${escapeHtml(task.scheme)}" data-task-id="${escapeHtml(task.task_id || "")}" ${task.can_stop ? "" : "disabled"}>停止</button>
        </div>
      </td>
      <td><span class="status-pill ${boardStatusClass(task.status)}">${escapeHtml(task.status || "未计算")}</span></td>
      <td>${escapeHtml(task.process_id || "-")}</td>
      <td>${escapeHtml(formatTimeOfDay(task.start_time))}</td>
      <td>${escapeHtml(formatTimeOfDay(task.end_time))}</td>
      <td>${escapeHtml(fmt(task.elapsed_seconds || 0, 3))}</td>
      <td class="batch-log-cell" title="${escapeHtml(task.latest_log || "")}">${escapeHtml(task.latest_log || "-")}</td>
    </tr>
  `;
}

function defaultResultName(task) {
  return task.task_type_key === "verification" ? "verification_timeseries.csv" : "opt_result.xlsx";
}

function pageConfig(key) {
  return BATCH_TASK_PAGES.find((page) => page.key === key) || BATCH_TASK_PAGES[0];
}

function boardStatusClass(status) {
  if (["计算中", "校核中", "准备启动"].includes(status)) return "running";
  if (status === "排队中") return "queued";
  if (["完成计算", "完成校核"].includes(status)) return "done";
  if (["计算失败", "计算中止", "校核失败", "校核中止", "退出队列"].includes(status)) return "failed";
  return "";
}

async function handleTaskAction(event) {
  const button = event.target?.closest?.("[data-task-action]");
  if (!button || button.disabled) return;
  button.disabled = true;
  setError("batchError", "");
  try {
    const payload = await api("/api/tasks/control", {
      method: "POST",
      body: JSON.stringify({
        action: button.dataset.taskAction,
        task_type: button.dataset.taskType,
        scheme: button.dataset.scheme,
        task_id: button.dataset.taskId || "",
      }),
    });
    batchState.tasks = payload.tasks || [];
    normalizeSchemeFilter();
    renderBatchTasks();
  } catch (error) {
    showBatchError(error);
    await loadBatchTasks().catch(() => null);
  }
}

function showBatchError(error) {
  setError("batchError", error.message || "操作失败");
}
