const OPTIMIZATION_SCHEME_STORAGE_KEY = "estoreLastOptimizationScheme";

const state = {
  schemes: [],
  currentScheme: "",
  task: null,
  taskBoard: [],
  pollTimer: 0,
  activeResultTab: "overview",
  currentLogs: [],
  clearedLogKey: "",
};

document.addEventListener("DOMContentLoaded", () => {
  bindResultTabs();
  bindOptimizationActions();
  bindLogContextMenu({
    boxId: "optimizationLogs",
    emptyText: "暂无运行日志",
    clearLogs: clearOptimizationLogs,
    saveLogs: saveOptimizationLogs,
  });
  loadSchemes().then(refreshOptimizationStatus).catch(showError);
  state.pollTimer = window.setInterval(refreshOptimizationStatus, 4000);
});

async function loadSchemes() {
  const payload = await api("/api/schemes");
  state.schemes = payload.schemes || [];
  const stored = readStoredText(OPTIMIZATION_SCHEME_STORAGE_KEY);
  if (stored && state.schemes.some((scheme) => scheme.name === stored)) state.currentScheme = stored;
  if (!state.currentScheme && state.schemes[0]) state.currentScheme = state.schemes[0].name;
  renderSchemes();
  renderCurrentScheme();
}

function renderSchemes() {
  const list = document.getElementById("schemeList");
  if (!list) return;
  if (!state.schemes.length) {
    list.innerHTML = '<div class="validation-item">暂无方案，请先在输入配置中新建方案。</div>';
    return;
  }
  list.innerHTML = `<ul class="scheme-list-items" role="listbox">${state.schemes
    .map((scheme) => `<li class="scheme-item ${scheme.name === state.currentScheme ? "active" : ""}" data-name="${escapeHtml(scheme.name)}" role="option" aria-selected="${scheme.name === state.currentScheme ? "true" : "false"}" tabindex="0">${escapeHtml(scheme.name)}</li>`)
    .join("")}</ul>`;
  list.querySelectorAll(".scheme-item").forEach((item) => {
    const select = () => {
      state.currentScheme = item.dataset.name || "";
      writeStoredText(OPTIMIZATION_SCHEME_STORAGE_KEY, state.currentScheme);
      state.task = null;
      renderSchemes();
      renderCurrentScheme();
      renderOptimization();
      refreshOptimizationStatus().catch(showError);
    };
    item.addEventListener("click", select);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
}

function renderCurrentScheme() {
  document.getElementById("optimizationCurrentScheme").textContent = `当前: ${state.currentScheme || "未选择方案"}`;
}

function bindOptimizationActions() {
  document.getElementById("startOptimization")?.addEventListener("click", () => controlOptimization("start"));
  document.getElementById("queueOptimization")?.addEventListener("click", () => controlOptimization("queue"));
  document.getElementById("stopOptimization")?.addEventListener("click", () => controlOptimization("stop"));
}

async function controlOptimization(action) {
  if (!state.currentScheme) {
    showError(new Error("请先选择方案"));
    return;
  }
  setError("solveError", "");
  try {
    const currentRow = currentBoardRow();
    const payload = await api("/api/tasks/control", {
      method: "POST",
      body: JSON.stringify({
        action,
        task_type: "optimization",
        scheme: state.currentScheme,
        task_id: currentRow?.task_id || state.task?.id || "",
      }),
    });
    state.taskBoard = payload.tasks || [];
    if (payload.task?.id) {
      await loadTaskDetail(payload.task.id);
    } else {
      await refreshOptimizationStatus();
    }
  } catch (error) {
    showError(error);
    await refreshOptimizationStatus().catch(() => null);
  }
}

async function refreshOptimizationStatus() {
  if (!state.currentScheme) return;
  const board = await api("/api/task-board");
  state.taskBoard = board.tasks || [];
  const row = currentBoardRow();
  if (row?.task_id) {
    await loadTaskDetail(row.task_id);
  } else {
    state.task = null;
    renderOptimization();
  }
}

function currentBoardRow() {
  return state.taskBoard.find((task) => task.task_type_key === "optimization" && task.scheme === state.currentScheme);
}

async function loadTaskDetail(id) {
  state.task = await api(`/api/task?id=${encodeURIComponent(id)}`);
  renderOptimization();
}

function renderOptimization() {
  const task = state.task;
  const row = currentBoardRow() || {};
  const metrics = task?.metrics || row.metrics || {};
  const status = task?.status || row.status || "待启动";
  document.getElementById("optimizationStatus").textContent = status;
  document.getElementById("optimizationStartTime").textContent = task?.start_time || row.start_time || "-";
  document.getElementById("optimizationEndTime").textContent = task?.end_time || row.end_time || "-";
  document.getElementById("optimizationFuel").textContent = valueWithUnit(metrics.fuel_kg, "kg");
  document.getElementById("optimizationGap").textContent = fmt(metrics.gap);
  updateActionButtons(status, row);
  renderOverview(task, metrics);
  renderEconomic(task, metrics);
  renderSafety(task, metrics);
  renderLogs(task, row);
  renderCurves(task, metrics);
}

function updateActionButtons(status, row) {
  const active = ["排队中", "准备启动", "计算中"].includes(status);
  document.getElementById("startOptimization").disabled = active;
  document.getElementById("queueOptimization").disabled = active;
  document.getElementById("stopOptimization").disabled = !(row?.can_stop || active);
}

function renderOverview(task, metrics) {
  const rows = [
    ["任务ID", task?.id || "-"],
    ["方案", state.currentScheme || "-"],
    ["状态", task?.status || currentBoardRow()?.status || "待启动"],
    ["求解状态", metrics.status || "-"],
    ["燃油消耗(kg)", fmt(metrics.fuel_kg)],
    ["目标函数", fmt(metrics.objective)],
    ["Gap", fmt(metrics.gap)],
    ["求解时间(s)", fmt(metrics.time_s)],
    ["输出目录", task?.run_dir || "-"],
  ];
  document.getElementById("overviewResult").innerHTML = `
    <div class="optimization-overview-grid">
      <div class="overview-composition-stack">
        ${metricSummaryCard("燃油消耗", valueWithUnit(metrics.fuel_kg, "kg"), "#1fc7aa")}
        ${metricSummaryCard("目标函数", fmt(metrics.objective), "#72a7ff")}
        ${metricSummaryCard("Gap", fmt(metrics.gap), "#ffbd73")}
      </div>
      <div class="overview-column-resize-handle" aria-hidden="true"></div>
      <div class="overview-table-card">
        <h2>优化求解结果</h2>
        ${renderTable(rows)}
      </div>
    </div>
  `;
}

function renderEconomic(task, metrics) {
  const rows = [
    ["燃油消耗(kg)", fmt(metrics.fuel_kg)],
    ["目标函数", fmt(metrics.objective)],
    ["Gap", fmt(metrics.gap)],
    ["求解时间(s)", fmt(metrics.time_s)],
    ["返回码", task?.return_code ?? "-"],
  ];
  document.getElementById("greenResult").innerHTML = `
    <div class="green-result-layout">
      <div class="green-result-table data-table">${renderPlainTable(rows)}</div>
      <div class="result-column-resize-handle" aria-hidden="true"></div>
      <div class="green-chart-card">
        <div class="green-chart-legend">经济性指标</div>
        <div class="mini-bar-chart">
          ${miniBar("燃油", metrics.fuel_kg, "#1fc7aa")}
          ${miniBar("目标", metrics.objective, "#72a7ff")}
          ${miniBar("Gap", metrics.gap, "#ffbd73")}
        </div>
      </div>
    </div>
  `;
}

function renderSafety(task, metrics) {
  const rows = [
    ["SOC范围", metrics.soc_min == null ? "-" : `${fmt(metrics.soc_min)} - ${fmt(metrics.soc_max)}`],
    ["电池温度(℃)", metrics.tbat_min_c == null ? "-" : `${fmt(metrics.tbat_min_c)} - ${fmt(metrics.tbat_max_c)}`],
    ["液冷罐温度(℃)", metrics.ttank_min_c == null ? "-" : `${fmt(metrics.ttank_min_c)} - ${fmt(metrics.ttank_max_c)}`],
    ["舱体温度(℃)", metrics.tcont_min_c == null ? "-" : `${fmt(metrics.tcont_min_c)} - ${fmt(metrics.tcont_max_c)}`],
    ["变量数", fmt(metrics.variables_total)],
    ["二进制变量", fmt(metrics.binary_variables)],
    ["约束数", fmt(metrics.constraints_total)],
  ];
  document.getElementById("safetyResult").innerHTML = `
    <div class="safety-result-layout">
      <div class="safety-result-table data-table">${renderPlainTable(rows)}</div>
      <div class="result-column-resize-handle" aria-hidden="true"></div>
      <div class="safety-chart-card">
        <div class="safety-chart-legend">安全性指标</div>
        <div class="mini-bar-chart">
          ${miniBar("SOC下限", metrics.soc_min, "#1fc7aa")}
          ${miniBar("SOC上限", metrics.soc_max, "#72a7ff")}
          ${miniBar("电芯温度", metrics.tbat_max_c, "#ffbd73")}
        </div>
      </div>
    </div>
  `;
}

function progressLines(progress) {
  if (!progress || !Object.keys(progress).length) return ["-"];
  const lines = [
    `阶段: ${progress.stage || "-"}`,
    `更新时间: ${progress.updated_at || "-"}`,
    `消息: ${progress.message || "-"}`,
    `当前求解器: ${progress.active_solver || "-"} / ${progress.active_backend || "-"}`,
  ];
  if (progress.solver_order?.length) lines.push(`求解器顺序: ${progress.solver_order.join(" -> ")}`);
  if (progress.mode || progress.steps || progress.dt_minutes) {
    lines.push(`模型: ${progress.mode || "-"}; ${progress.hours ?? "-"} h; ${progress.steps ?? "-"} 步; ${fmt(progress.dt_minutes)} min`);
  }
  if (progress.estimated_scale) lines.push(`规模估算: ${JSON.stringify(progress.estimated_scale)}`);
  const attempts = Array.isArray(progress.solver_attempts) ? progress.solver_attempts : [];
  if (attempts.length) {
    lines.push("求解器尝试:");
    attempts.forEach((attempt) => {
      lines.push(
        `  ${attempt.attempt || "-"}: ${attempt.solver || "-"} / ${attempt.backend || "-"}; ` +
          `状态=${attempt.status || "-"}; 成功=${attempt.success ? "是" : "否"}; 用时=${fmt(attempt.elapsed_s)}s`
      );
      if (attempt.message) lines.push(`    ${attempt.message}`);
    });
  }
  const result = progress.final_result || progress.last_result;
  if (result) {
    lines.push(
      `最近结果: ${result.status || "-"}; 目标=${fmt(result.objective)}; Gap=${fmt(result.gap)}; 燃油=${fmt(result.fuel_kg)}kg; 用时=${fmt(result.time_s)}s`
    );
  }
  return lines;
}

function currentLogKey(task = state.task) {
  return task?.id || `scheme:${state.currentScheme || ""}`;
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== "object") return { time: "", level: "info", message: String(entry || "") };
  return {
    time: entry.time || "",
    level: entry.level || "info",
    message: entry.message || "",
  };
}

function parseTimestampedLogLine(line, level = "info") {
  const text = String(line || "");
  const match = text.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*(.*)$/);
  if (match) return { time: match[1], level, message: match[2] || "" };
  return { time: "", level, message: text };
}

function buildOptimizationLogs(task, row) {
  if (state.clearedLogKey && state.clearedLogKey === currentLogKey(task)) return [];
  const logs = [];
  const progressTime = task?.progress?.updated_at || "";
  logs.push({ time: task?.created_at || "", level: "info", message: `任务ID: ${task?.id || "-"}` });
  logs.push({ time: task?.created_at || "", level: "info", message: `方案: ${state.currentScheme || "-"}` });
  logs.push({ time: task?.start_time || "", level: statusLogLevel(task?.status || row?.status), message: `状态: ${task?.status || row?.status || "待启动"}` });
  if (task?.process_id) logs.push({ time: task?.start_time || "", level: "info", message: `进程: ${task.process_id}` });
  if (task?.run_dir) logs.push({ time: task?.start_time || "", level: "info", message: `输出目录: ${task.run_dir}` });
  if (task?.command?.length) logs.push({ time: task?.start_time || "", level: "info", message: `命令: ${task.command.join(" ")}` });
  progressLines(task?.progress).forEach((line) => {
    if (line && line !== "-") logs.push({ time: progressTime, level: "info", message: line });
  });
  const stdoutLogs = Array.isArray(task?.logs) ? task.logs.map(normalizeLogEntry) : [];
  if (stdoutLogs.length) {
    logs.push(...stdoutLogs);
  } else if (task?.latest_log || row?.latest_log) {
    logs.push(parseTimestampedLogLine(task?.latest_log || row?.latest_log || "-", statusLogLevel(task?.status || row?.status)));
  }
  return logs;
}

function statusLogLevel(status) {
  if (String(status || "").includes("失败") || String(status || "").includes("中止")) return "warn";
  if (String(status || "").includes("完成")) return "ok";
  return "info";
}

function renderLogs(task, row) {
  const logs = buildOptimizationLogs(task, row);
  state.currentLogs = logs;
  renderOptimizationLogs(logs);
}

function renderOptimizationLogs(logs) {
  const box = document.getElementById("optimizationLogs");
  if (!box) return;
  const shouldStickToBottom = isLogScrolledNearBottom(box);
  const previousScrollTop = box.scrollTop;
  if (!logs.length) {
    box.innerHTML = '<div class="log-line"><span></span><strong>暂无运行日志</strong></div>';
    return;
  }
  box.innerHTML = logs
    .map((item) => `<div class="log-line ${escapeHtml(item.level || "")}"><span>${escapeHtml(item.time || "")}</span><strong>${escapeHtml(item.message || "")}</strong></div>`)
    .join("");
  box.scrollTop = shouldStickToBottom ? box.scrollHeight : previousScrollTop;
}

function isLogScrolledNearBottom(box) {
  const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
  return distance <= 12;
}

async function clearOptimizationLogs() {
  state.clearedLogKey = currentLogKey();
  state.currentLogs = [];
  renderOptimizationLogs([]);
}

function saveOptimizationLogs() {
  saveLogsToFile(state.currentLogs || [], `优化求解_${state.currentScheme || "未选择方案"}_运行日志`);
}

function bindLogContextMenu({ boxId, emptyText, clearLogs, saveLogs }) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const menu = createLogContextMenu();
  box.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showLogContextMenu(menu, event.clientX, event.clientY);
  });
  menu.addEventListener("click", async (event) => {
    const action = event.target?.dataset?.logMenuAction;
    if (!action) return;
    hideLogContextMenu(menu);
    try {
      if (action === "clear") await clearLogs();
      else if (action === "save") saveLogs();
    } catch (error) {
      showError(error);
    }
  });
  window.addEventListener("click", () => hideLogContextMenu(menu));
  window.addEventListener("resize", () => hideLogContextMenu(menu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideLogContextMenu(menu);
  });
  if (!box.textContent.trim()) box.innerHTML = `<div class="log-line"><span></span><strong>${escapeHtml(emptyText)}</strong></div>`;
}

function createLogContextMenu() {
  const menu = document.createElement("div");
  menu.className = "log-context-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" role="menuitem" data-log-menu-action="clear">清空日志</button>
    <button type="button" role="menuitem" data-log-menu-action="save">保存日志到文件</button>`;
  document.body.appendChild(menu);
  return menu;
}

function showLogContextMenu(menu, x, y) {
  menu.hidden = false;
  const width = menu.offsetWidth || 180;
  const height = menu.offsetHeight || 88;
  const left = Math.min(x, window.innerWidth - width - 8);
  const top = Math.min(y, window.innerHeight - height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function hideLogContextMenu(menu) {
  menu.hidden = true;
}

function saveLogsToFile(logs, baseName) {
  const content = formatLogsForFile(logs);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(baseName)}_${timestampForFile()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatLogsForFile(logs) {
  if (!logs.length) return "暂无运行日志\n";
  return `${logs.map((item) => `[${item.time || ""}] [${item.level || "info"}] ${item.message || ""}`).join("\n")}\n`;
}

function timestampForFile() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function safeFileName(value) {
  return String(value || "运行日志").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "运行日志";
}

function renderCurves(task, metrics) {
  const curveItems = [
    ["燃油消耗", metrics.fuel_kg],
    ["目标函数", metrics.objective],
    ["Gap", metrics.gap],
    ["SOC最小值", metrics.soc_min],
    ["SOC最大值", metrics.soc_max],
    ["电池温度最大值", metrics.tbat_max_c],
  ];
  document.getElementById("optimizationCurveNameList").innerHTML = `
    <ul class="scheme-list-items">${curveItems.map(([name]) => `<li class="scheme-item">${escapeHtml(name)}</li>`).join("")}</ul>
  `;
  document.getElementById("optimizationCurveChart").innerHTML = `
    <div class="mini-bar-chart optimization-curve-fallback">
      ${curveItems.map(([name, value], index) => miniBar(name, value, ["#1fc7aa", "#72a7ff", "#ffbd73", "#5fe7d8", "#b6f5ff", "#ff7b72"][index % 6])).join("")}
    </div>
  `;
}

function bindResultTabs() {
  document.querySelectorAll("[data-result-tab]").forEach((button) => {
    button.addEventListener("click", () => switchResultTab(button.dataset.resultTab || "overview"));
  });
}

function switchResultTab(tab) {
  state.activeResultTab = tab;
  document.querySelectorAll("[data-result-tab]").forEach((button) => {
    const active = button.dataset.resultTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-result-panel]").forEach((panel) => {
    const active = panel.dataset.resultPanel === tab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function metricSummaryCard(title, value, color) {
  return `
    <section class="composition-bar-card">
      <h2>${escapeHtml(title)}</h2>
      <div class="composition-bar-summary">
        <span><em class="composition-bar-summary-label"><i class="composition-bar-summary-dot" style="background:${color}"></i>${escapeHtml(title)}</em><strong>${escapeHtml(value)}</strong></span>
      </div>
      <div class="composition-bar-track"><div class="composition-bar-segment" style="width:100%; --composition-segment-color:${color}"><span>${escapeHtml(value)}</span></div></div>
    </section>
  `;
}

function renderTable(rows) {
  return `<div class="optimization-overview-table data-table">${renderPlainTable(rows)}</div>`;
}

function renderPlainTable(rows) {
  return `
    <table>
      <tbody>
        ${rows.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "-")}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function miniBar(label, rawValue, color) {
  const value = Number(rawValue);
  const safe = Number.isFinite(value) ? Math.max(8, Math.min(100, Math.abs(value) % 100 || 12)) : 8;
  return `
    <div class="mini-bar-item">
      <div class="mini-bar-value">${escapeHtml(fmt(rawValue))}</div>
      <div class="mini-bar-track"><span style="height:${safe}%; background:${color}"></span></div>
      <div class="mini-bar-label">${escapeHtml(label)}</div>
    </div>
  `;
}

function valueWithUnit(value, unit) {
  const text = fmt(value);
  return text === "-" ? "-" : `${text}${unit}`;
}

function readStoredText(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (error) {
    return "";
  }
}

function writeStoredText(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (error) {
    // 本地存储不可用时不影响页面操作。
  }
}

function showError(error) {
  setError("solveError", error.message || "操作失败");
}
