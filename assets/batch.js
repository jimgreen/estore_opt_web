const batchState = {
  tasks: [],
  activeTaskType: "optimization",
  timer: 0,
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshTasks")?.addEventListener("click", loadBatchTasks);
  document.querySelectorAll("[data-task-page]").forEach((button) => {
    button.addEventListener("click", () => switchTaskPage(button.dataset.taskPage || "optimization"));
  });
  document.getElementById("optimizationTaskTable")?.addEventListener("click", handleTaskAction);
  document.getElementById("verificationTaskTable")?.addEventListener("click", handleTaskAction);
  loadBatchTasks().catch(showBatchError);
  batchState.timer = window.setInterval(loadBatchTasks, 4000);
});

async function loadBatchTasks() {
  try {
    const payload = await api("/api/task-board");
    batchState.tasks = payload.tasks || [];
    renderBatchTasks();
  } catch (error) {
    showBatchError(error);
  }
}

function switchTaskPage(taskType) {
  if (!["optimization", "verification"].includes(taskType)) return;
  batchState.activeTaskType = taskType;
  document.querySelectorAll("[data-task-page]").forEach((button) => {
    const active = button.dataset.taskPage === taskType;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-task-section]").forEach((section) => {
    const active = section.dataset.taskSection === taskType;
    section.classList.toggle("active", active);
    section.hidden = !active;
  });
}

function renderBatchTasks() {
  renderTaskTable("optimization", "optimizationTaskTable", "暂无优化求解任务。");
  renderTaskTable("verification", "verificationTaskTable", "暂无方案校核任务。");
  switchTaskPage(batchState.activeTaskType);
}

function renderTaskTable(taskType, targetId, emptyText) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const tasks = batchState.tasks.filter((task) => task.task_type_key === taskType);
  if (!tasks.length) {
    target.innerHTML = `<div class="scheme-item">${escapeHtml(emptyText)}</div>`;
    return;
  }
  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>方案</th>
          <th>说明</th>
          <th>操作</th>
          <th>状态</th>
          <th>进程号</th>
          <th>开始</th>
          <th>结束</th>
          <th>耗时(s)</th>
          <th>关键指标</th>
          <th>最新日志</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(renderTaskRow).join("")}
      </tbody>
    </table>
  `;
}

function renderTaskRow(task) {
  return `
    <tr>
      <td>${escapeHtml(task.scheme || "-")}</td>
      <td>${escapeHtml(task.scheme_description || "-")}</td>
      <td class="task-actions-cell">
        <div class="task-actions">
          <button class="primary small" type="button" data-task-action="start" data-task-type="${escapeHtml(task.task_type_key)}" data-scheme="${escapeHtml(task.scheme)}" ${task.can_start ? "" : "disabled"}>开始</button>
          <button class="small" type="button" data-task-action="queue" data-task-type="${escapeHtml(task.task_type_key)}" data-scheme="${escapeHtml(task.scheme)}" ${task.can_queue ? "" : "disabled"}>排队</button>
          <button class="danger small" type="button" data-task-action="stop" data-task-type="${escapeHtml(task.task_type_key)}" data-scheme="${escapeHtml(task.scheme)}" data-task-id="${escapeHtml(task.task_id || "")}" ${task.can_stop ? "" : "disabled"}>停止</button>
        </div>
      </td>
      <td><span class="status-pill ${boardStatusClass(task.status)}">${escapeHtml(task.status || "未计算")}</span></td>
      <td>${escapeHtml(task.process_id || "-")}</td>
      <td>${escapeHtml(task.start_time || "-")}</td>
      <td>${escapeHtml(task.end_time || "-")}</td>
      <td>${escapeHtml(task.elapsed_seconds || 0)}</td>
      <td>${escapeHtml(renderMetricText(task))}</td>
      <td class="task-log-cell" title="${escapeHtml(task.latest_log || "")}">${escapeHtml(task.latest_log || "-")}</td>
    </tr>
  `;
}

function renderMetricText(task) {
  const metrics = task.metrics || {};
  if (task.task_type_key === "verification") {
    const soc = metrics.soc?.max_abs;
    const temp = metrics.t_bat_c?.max_abs;
    return `SOC偏差 ${fmt(soc, 6)} / 电芯温差 ${fmt(temp, 6)}`;
  }
  const currentViolation = Math.max(Number(metrics.charge_current_limit_violation_max_a || 0), Number(metrics.discharge_current_limit_violation_max_a || 0));
  return `燃油 ${fmt(metrics.fuel_kg)} / Gap ${fmt(metrics.gap)} / 电流越限 ${fmt(currentViolation, 6)}A`;
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
    renderBatchTasks();
  } catch (error) {
    showBatchError(error);
    await loadBatchTasks().catch(() => null);
  }
}

function showBatchError(error) {
  setError("batchError", error.message || "操作失败");
}
