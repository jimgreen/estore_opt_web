const OPTIMIZATION_SCHEME_STORAGE_KEY = "estoreLastOptimizationScheme";

const state = {
  schemes: [],
  currentScheme: "",
  task: null,
  taskBoard: [],
  pollTimer: 0,
  activeResultTab: "overview",
  selectedCurveKey: "",
  selectedCurveKeys: [],
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
  document.getElementById("optimizationStartTime").textContent = formatTimeOfDay(task?.start_time || row.start_time);
  document.getElementById("optimizationEndTime").textContent = formatTimeOfDay(task?.end_time || row.end_time);
  document.getElementById("optimizationFuel").textContent = valueWithUnit(metrics.fuel_kg, "kg");
  document.getElementById("optimizationGap").textContent = fmt(metrics.gap);
  updateActionButtons(status, row);
  renderOverview(task, metrics);
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
  const resultData = task?.result_data || {};
  const statistics = task?.statistics || resultData.statistics || {};
  const checks = statistics?.checks || {};
  const modelStats = statistics?.model_stats || {};
  const currentRow = currentBoardRow() || {};
  const taskStatus = task?.status || currentRow.status || "待启动";
  const solverStatus = formatSolverStatus(firstPresent(metrics.status, statistics.status, "-"));
  const rowCount = firstPresent(resultData.row_count, statistics.row_count, modelStats.steps, metrics.steps);
  const seriesCount = firstPresent(Array.isArray(resultData.series) ? resultData.series.length : null, statistics.series_count);
  const socMin = firstPresent(checks.soc_min, metrics.soc_min);
  const socMax = firstPresent(checks.soc_max, metrics.soc_max);
  const tbatMin = firstPresent(checks.tbat_min_c, metrics.tbat_min_c);
  const tbatMax = firstPresent(checks.tbat_max_c, metrics.tbat_max_c);
  const ttankMin = firstPresent(checks.ttank_min_c, metrics.ttank_min_c);
  const ttankMax = firstPresent(checks.ttank_max_c, metrics.ttank_max_c);
  const tcontMin = firstPresent(checks.tcont_min_c, metrics.tcont_min_c);
  const tcontMax = firstPresent(checks.tcont_max_c, metrics.tcont_max_c);
  const chargeViolation = firstPresent(checks.charge_current_limit_violation_max_a, metrics.charge_current_limit_violation_max_a);
  const dischargeViolation = firstPresent(checks.discharge_current_limit_violation_max_a, metrics.discharge_current_limit_violation_max_a);
  const maxCurrentViolation = Math.max(numberOrZero(chargeViolation), numberOrZero(dischargeViolation));
  const balanceResidual = firstPresent(checks.model_balance_max_kw, metrics.model_balance_max_kw);
  const pbessDeviation = firstPresent(checks.pbess_physical_max_kw, metrics.pbess_physical_max_kw);

  const kpis = [
    ["求解状态", solverStatus, taskStatus, "status"],
    ["燃油消耗", valueWithUnit(metrics.fuel_kg, "kg"), "柴油机实际消耗", "fuel"],
    ["目标函数", fmt(metrics.objective), "优化目标值", "objective"],
    ["Gap", fmt(metrics.gap), "收敛间隙", "gap"],
    ["求解时间", valueWithUnit(metrics.time_s, "s"), "后台计算耗时", "time"],
  ];
  const economicRows = [
    { label: "燃油消耗", value: valueWithUnit(metrics.fuel_kg, "kg"), badge: "核心指标", badgeTone: "primary", tone: "fuel" },
    { label: "目标函数", value: fmt(metrics.objective), badge: "目标", tone: "objective" },
    { label: "Gap", value: fmt(metrics.gap), badge: gapBadge(metrics.gap), badgeTone: gapBadgeTone(metrics.gap), tone: "gap" },
    { label: "求解时间", value: valueWithUnit(metrics.time_s, "s"), badge: "耗时", tone: "time" },
    { label: "返回码", value: task?.return_code ?? "-", badge: returnCodeBadge(task?.return_code), badgeTone: returnCodeBadgeTone(task?.return_code) },
  ];
  const safetyRows = [
    { label: "SOC范围", value: formatRange(socMin, socMax), badge: valueReadyBadge(socMin), badgeTone: "neutral", tone: "soc" },
    { label: "电芯温度", value: formatRange(tbatMin, tbatMax, "℃"), badge: valueReadyBadge(tbatMin), tone: "temp" },
    { label: "液冷罐温度", value: formatRange(ttankMin, ttankMax, "℃"), badge: valueReadyBadge(ttankMin), tone: "temp" },
    { label: "舱体温度", value: formatRange(tcontMin, tcontMax, "℃"), badge: valueReadyBadge(tcontMin), tone: "temp" },
    {
      label: "电流限值越限",
      value: formatCurrentViolation(chargeViolation, dischargeViolation),
      badge: maxCurrentViolation > 0 ? "越限" : "未越限",
      badgeTone: maxCurrentViolation > 0 ? "danger" : "ok",
      tone: maxCurrentViolation > 0 ? "danger" : "safe",
    },
  ];
  const modelRows = [
    { label: "时序点数", value: fmt(rowCount, 0), badge: "曲线", tone: "curve" },
    { label: "曲线数量", value: fmt(seriesCount, 0), badge: "结果", tone: "curve" },
    { label: "变量数", value: fmt(firstPresent(modelStats.variables_total, metrics.variables_total), 0), badge: "模型", tone: "model" },
    { label: "二进制变量", value: fmt(firstPresent(modelStats.binary_variables, metrics.binary_variables), 0), badge: "MIP", tone: "model" },
    { label: "约束数", value: fmt(firstPresent(modelStats.constraints_total, metrics.constraints_total), 0), badge: "模型", tone: "model" },
    { label: "功率平衡残差", value: formatValueWithUnit(balanceResidual, "kW", 6), badge: valueReadyBadge(balanceResidual), tone: "check" },
    { label: "P_BESS后验偏差", value: formatValueWithUnit(pbessDeviation, "kW", 6), badge: valueReadyBadge(pbessDeviation), tone: "check" },
    { label: "时间步长", value: formatValueWithUnit(firstPresent(modelStats.dt_minutes, metrics.dt_minutes), "min"), badge: "步长", tone: "time" },
  ];
  const taskRows = [
    ["任务ID", task?.id || "-"],
    ["方案", state.currentScheme || "-"],
    ["任务状态", taskStatus],
    ["开始时间", formatTimeOfDay(task?.start_time || currentRow.start_time)],
    ["完成时间", formatTimeOfDay(task?.end_time || currentRow.end_time)],
    ["输出目录", task?.run_dir || "-"],
  ];
  document.getElementById("overviewResult").innerHTML = `
    <div class="result-overview-workbench">
      <div class="result-kpi-grid" aria-label="优化调度关键指标">
        ${kpis.map(([title, value, caption, tone]) => renderKpiCard(title, value, caption, tone)).join("")}
      </div>
      <div class="result-section-grid">
        ${renderResultSection("经济性", "消耗、目标函数与求解质量", economicRows)}
        ${renderResultSection("安全性", "SOC、温度、电流限值", safetyRows)}
        ${renderResultSection("模型校核", "曲线完整性、模型规模与残差", modelRows)}
      </div>
      <section class="result-section result-artifact-section">
        <div class="result-section-title"><strong>任务与结果文件</strong><span>结果工作簿作为界面展示和后续校核的数据源</span></div>
        <div class="result-artifact-layout">
          ${renderInfoList(taskRows)}
          <div class="result-file-zone">
            <div class="result-file-zone-title">结果文件</div>
            ${renderResultFiles(task?.result_files || [])}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderKpiCard(title, value, caption, tone = "neutral") {
  return `
    <section class="result-kpi-card tone-${cssToken(tone)}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value ?? "-")}</strong>
      <em>${escapeHtml(caption || "")}</em>
    </section>
  `;
}

function renderResultSection(title, caption, rows) {
  return `
    <section class="result-section">
      <div class="result-section-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(caption)}</span></div>
      <div class="result-metric-list">
        ${rows.map(renderMetricRow).join("")}
      </div>
    </section>
  `;
}

function renderMetricRow(row) {
  const tone = cssToken(row.tone || "neutral");
  const badge = row.badge
    ? `<em class="result-row-badge ${cssToken(row.badgeTone || "neutral")}">${escapeHtml(row.badge)}</em>`
    : "";
  return `
    <div class="result-metric-row tone-${tone}">
      <span>${escapeHtml(row.label || "")}${badge}</span>
      <strong>${escapeHtml(row.value ?? "-")}</strong>
    </div>
  `;
}

function renderInfoList(rows) {
  return `
    <div class="result-info-list">
      ${rows.map(([label, value]) => `<div class="result-info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "-")}</strong></div>`).join("")}
    </div>
  `;
}

function firstPresent(...items) {
  return items.find((item) => item !== null && item !== undefined && item !== "");
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cssToken(value) {
  return String(value || "neutral").replace(/[^a-z0-9_-]/gi, "") || "neutral";
}

function formatValueWithUnit(value, unit, digits = 3) {
  const text = fmt(value, digits);
  return text === "-" ? "-" : `${text}${unit}`;
}

function formatRange(minValue, maxValue, unit = "") {
  if (firstPresent(minValue, maxValue) === undefined) return "-";
  return `${fmt(minValue)} - ${fmt(maxValue)}${unit}`;
}

function formatCurrentViolation(chargeValue, dischargeValue) {
  const hasCharge = firstPresent(chargeValue) !== undefined;
  const hasDischarge = firstPresent(dischargeValue) !== undefined;
  if (!hasCharge && !hasDischarge) return "-";
  return `${fmt(hasCharge ? chargeValue : 0, 6)} / ${fmt(hasDischarge ? dischargeValue : 0, 6)}A`;
}

function formatSolverStatus(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return "-";
  const normalized = raw.replace(/,_/g, "_").replace(/,+/g, "_").replace(/__+/g, "_").toUpperCase();
  const labels = {
    OPTIMAL: "最优",
    INFEASIBLE: "不可行",
    UNBOUNDED: "无界",
    TIME_LIMIT: "时间限制",
    INTEGER_OPTIMAL_TOLERANCE: "整数可行(容差内)",
    SUBOPTIMAL: "次优",
  };
  return labels[normalized] || normalized;
}

function valueReadyBadge(value) {
  return firstPresent(value) === undefined ? "无数据" : "已记录";
}

function gapBadge(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "无数据";
  return number <= 0.01 ? "已收敛" : "需关注";
}

function gapBadgeTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "neutral";
  return number <= 0.01 ? "ok" : "warning";
}

function returnCodeBadge(value) {
  if (firstPresent(value) === undefined) return "无数据";
  return Number(value) === 0 ? "正常" : "异常";
}

function returnCodeBadgeTone(value) {
  if (firstPresent(value) === undefined) return "neutral";
  return Number(value) === 0 ? "ok" : "danger";
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
  saveLogsToFile(state.currentLogs || [], `优化调度_${state.currentScheme || "未选择方案"}_运行日志`);
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

const CURVE_COLORS = ["#6ed7bf", "#8aa8ff", "#f4b860", "#ff7b72", "#68d391", "#b58cff", "#5cc8ff", "#d6e3f0"];

function renderCurves(task, metrics) {
  const resultData = task?.result_data || {};
  const series = Array.isArray(resultData.series) ? resultData.series.filter((item) => Array.isArray(item.values)) : [];
  const rows = Array.isArray(resultData.rows) ? resultData.rows : [];
  const nameList = document.getElementById("optimizationCurveNameList");
  const chart = document.getElementById("optimizationCurveChart");
  if (!nameList || !chart) return;
  if (!series.length) {
    const curveItems = [
      ["燃油消耗", metrics.fuel_kg],
      ["目标函数", metrics.objective],
      ["Gap", metrics.gap],
      ["SOC最小值", metrics.soc_min],
      ["SOC最大值", metrics.soc_max],
      ["电池温度最大值", metrics.tbat_max_c],
    ];
    nameList.innerHTML = `
      <div class="curve-list-header">暂无时序结果</div>
      <ul class="scheme-list-items">${curveItems.map(([name]) => `<li class="scheme-item">${escapeHtml(name)}</li>`).join("")}</ul>
    `;
    chart.innerHTML = `
      <div class="mini-bar-chart optimization-curve-fallback">
        ${curveItems.map(([name, value], index) => miniBar(name, value, ["#1fc7aa", "#72a7ff", "#ffbd73", "#5fe7d8", "#b6f5ff", "#ff7b72"][index % 6])).join("")}
      </div>
    `;
    return;
  }

  const selected = chooseCurveSeries(series);
  state.selectedCurveKey = String(selected[0]?.key || "");
  nameList.innerHTML = `
    <div class="curve-list-header">
      <strong>${fmt(resultData.row_count ?? rows.length, 0)}</strong><span>个时刻</span>
      <strong>${fmt(series.length, 0)}</strong><span>条曲线</span>
      <strong>${fmt(selected.length, 0)}</strong><span>已选</span>
    </div>
    <div class="curve-tree" role="tree" aria-label="曲线树">
      <div class="curve-tree-root">调度曲线</div>
      ${series
        .map((item, index) => renderCurveTreeNode(item, index))
        .join("")}
    </div>
  `;
  nameList.querySelectorAll("[data-curve-key]").forEach((button) => {
    button.addEventListener("change", () => {
      const key = button.dataset.curveKey || "";
      const selectedKeys = new Set(state.selectedCurveKeys || []);
      if (button.checked) selectedKeys.add(key);
      else selectedKeys.delete(key);
      state.selectedCurveKeys = Array.from(selectedKeys);
      renderCurves(state.task, state.task?.metrics || currentBoardRow()?.metrics || {});
    });
  });
  chart.innerHTML = renderMultiLineChart(selected, rows);
}

function renderCurveTreeNode(item, index) {
  const key = String(item.key || "");
  const active = (state.selectedCurveKeys || []).includes(key);
  const displayUnit = normalizedCurveUnit(item);
  const unit = displayUnit ? `(${displayUnit})` : "无单位";
  const color = CURVE_COLORS[index % CURVE_COLORS.length];
  return `
    <label class="curve-tree-node ${active ? "active" : ""}" role="treeitem" aria-selected="${active ? "true" : "false"}">
      <input type="checkbox" data-curve-key="${escapeHtml(key)}" ${active ? "checked" : ""}>
      <i style="--curve-node-color:${color}"></i>
      <span>${escapeHtml(item.label || item.key || "")}</span>
      <em>${escapeHtml(unit)}</em>
    </label>
  `;
}

function chooseCurveSeries(series) {
  const byKey = new Map(series.map((item) => [String(item.key || ""), item]));
  let keys = Array.isArray(state.selectedCurveKeys) ? state.selectedCurveKeys.filter((key) => byKey.has(String(key))) : [];
  if (!keys.length && state.selectedCurveKey && byKey.has(String(state.selectedCurveKey))) {
    keys = [String(state.selectedCurveKey)];
  }
  const preferred = ["SOC", "T_bat", "P_BESS", "I_bat", "load_kw", "pv_use_kw", "wt_use_kw"];
  if (!keys.length) {
    for (const key of preferred) {
      if (byKey.has(key)) {
        keys = [key];
        break;
      }
    }
  }
  if (!keys.length && series[0]) keys = [String(series[0].key || "")];
  state.selectedCurveKeys = keys;
  return keys.map((key) => byKey.get(String(key))).filter(Boolean);
}

function renderMultiLineChart(selectedSeries, rows) {
  const list = Array.isArray(selectedSeries) ? selectedSeries : [selectedSeries].filter(Boolean);
  if (!list.length) {
    return `<div class="curve-empty">请选择左侧曲线</div>`;
  }
  const charts = list.map((series, index) => ({ series, color: CURVE_COLORS[index % CURVE_COLORS.length], ...scaledChartSeries(series) }));
  const width = 920;
  const height = 430;
  const pad = { left: 64, right: 26, top: 34, bottom: 52 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const plotted = charts
    .map((chart) => ({
      ...chart,
      points: chart.values
        .map((value, index) => {
          const row = rows[index] || {};
          const rawX = Number(row.hour ?? index);
          return Number.isFinite(value) && Number.isFinite(rawX) ? { x: rawX, y: value, index } : null;
        })
        .filter(Boolean),
    }))
    .filter((chart) => chart.points.length);
  const allPoints = plotted.flatMap((chart) => chart.points);
  if (!allPoints.length) {
    return `<div class="curve-empty">当前曲线没有可绘制的数据</div>`;
  }
  let minX = Math.min(...allPoints.map((point) => point.x));
  let maxX = Math.max(...allPoints.map((point) => point.x));
  let minY = Math.min(...allPoints.map((point) => point.y));
  let maxY = Math.max(...allPoints.map((point) => point.y));
  if (Math.abs(maxX - minX) < 1e-9) {
    minX -= 1;
    maxX += 1;
  }
  if (Math.abs(maxY - minY) < 1e-9) {
    const expand = Math.max(1, Math.abs(maxY) * 0.1);
    minY -= expand;
    maxY += expand;
  }
  const xScale = (value) => pad.left + ((value - minX) / (maxX - minX)) * plotWidth;
  const yScale = (value) => pad.top + plotHeight - ((value - minY) / (maxY - minY)) * plotHeight;
  const yTicks = Array.from({ length: 5 }, (_, index) => minY + ((maxY - minY) * index) / 4);
  const xTicks = Array.from({ length: 6 }, (_, index) => minX + ((maxX - minX) * index) / 5);
  const unitSet = new Set(charts.map((chart) => chart.unit || "").filter(Boolean));
  const title = charts.length === 1 ? charts[0].series.label || charts[0].series.key || "曲线" : `${charts.length}条曲线对比`;
  const unitLabel = unitSet.size === 1 ? `单位: ${Array.from(unitSet)[0]}` : "单位: 混合";
  return `
    <div class="curve-chart-shell">
      <div class="curve-chart-toolbar">
        <div class="curve-chart-title">
          <h2>${escapeHtml(title)}</h2>
          <span>${escapeHtml(unitLabel)}</span>
        </div>
        <div class="curve-chart-stats" aria-label="曲线统计">
          <span>已选 ${escapeHtml(fmt(charts.length, 0))}</span>
          <span>最小 ${escapeHtml(fmt(minY))}</span>
          <span>最大 ${escapeHtml(fmt(maxY))}</span>
          <span>末值 ${escapeHtml(fmt(plotted[0]?.points.at(-1)?.y))}</span>
        </div>
      </div>
      <div class="curve-legend">
        ${charts
          .map((chart) => `<span><i style="background:${chart.color}"></i>${escapeHtml(chart.series.label || chart.series.key || "")}</span>`)
          .join("")}
      </div>
      <svg class="curve-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
        <rect x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}" class="curve-plot-bg"></rect>
        ${yTicks
          .map((tick) => {
            const y = yScale(tick);
            return `<line x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}" class="curve-grid-line"></line>
              <text x="${pad.left - 10}" y="${(y + 4).toFixed(2)}" class="curve-axis-label" text-anchor="end">${escapeHtml(fmt(tick))}</text>`;
          })
          .join("")}
        ${xTicks
          .map((tick) => {
            const x = xScale(tick);
            return `<line x1="${x.toFixed(2)}" y1="${pad.top}" x2="${x.toFixed(2)}" y2="${height - pad.bottom}" class="curve-grid-line vertical"></line>
              <text x="${x.toFixed(2)}" y="${height - 18}" class="curve-axis-label" text-anchor="middle">${escapeHtml(fmt(tick))}</text>`;
          })
          .join("")}
        ${plotted
          .map((chart) => {
            const path = chart.points.map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.x).toFixed(2)} ${yScale(point.y).toFixed(2)}`).join(" ");
            const lastPoint = chart.points[chart.points.length - 1];
            return `<path class="curve-line-shadow" d="${path}"></path>
              <path class="curve-line" style="--curve-color:${chart.color}" d="${path}"></path>
              <circle class="curve-last-point" style="--curve-color:${chart.color}" cx="${xScale(lastPoint.x).toFixed(2)}" cy="${yScale(lastPoint.y).toFixed(2)}" r="4"></circle>`;
          })
          .join("")}
        <text x="${width - pad.right}" y="${height - 4}" class="curve-axis-label" text-anchor="end">时刻(h)</text>
      </svg>
    </div>
  `;
}

function renderLineChart(series, rows) {
  return renderMultiLineChart([series], rows);
}

function scaledChartSeries(series) {
  const rawValues = Array.isArray(series.values) ? series.values : [];
  let values = rawValues.map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });
  let unit = String(series.unit || "");
  const maxAbs = values.reduce((max, value) => (value == null ? max : Math.max(max, Math.abs(value))), 0);
  if (String(series.key || "") === "SOC" && maxAbs <= 1.5) {
    values = values.map((value) => (value == null ? null : value * 100));
    unit = "%";
  } else if (unit === "W") {
    values = values.map((value) => (value == null ? null : value / 1000));
    unit = "kW";
  } else if (unit === "Ω" && maxAbs > 0 && maxAbs < 1) {
    values = values.map((value) => (value == null ? null : value * 1000));
    unit = "mΩ";
  }
  const valid = values.filter((value) => value != null);
  return {
    values,
    unit,
    min: valid.length ? Math.min(...valid) : null,
    max: valid.length ? Math.max(...valid) : null,
    avg: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null,
  };
}

function normalizedCurveUnit(series) {
  const unit = String(series?.unit || "");
  return unit === "W" ? "kW" : unit;
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
  const empty = value === null || value === undefined || value === "";
  const displayValue = empty ? "-" : value;
  const emptyClass = empty || displayValue === "-" ? " empty" : "";
  return `
    <section class="composition-bar-card${emptyClass}">
      <h2>${escapeHtml(title)}</h2>
      <div class="composition-bar-summary">
        <span><em class="composition-bar-summary-label"><i class="composition-bar-summary-dot" style="background:${color}"></i>${escapeHtml(title)}</em><strong>${escapeHtml(displayValue)}</strong></span>
      </div>
      <div class="composition-bar-track"><div class="composition-bar-segment" style="width:100%; --composition-segment-color:${color}"><span>${escapeHtml(displayValue)}</span></div></div>
    </section>
  `;
}

function statisticsRows(statistics, metrics) {
  const checks = statistics?.checks || {};
  const modelStats = statistics?.model_stats || {};
  const value = (...items) => items.find((item) => item !== null && item !== undefined && item !== "");
  return [
    ["时序点数", fmt(value(statistics?.row_count, modelStats.steps, metrics.steps), 0)],
    ["曲线数量", fmt(statistics?.series_count, 0)],
    ["SOC范围", value(checks.soc_min, metrics.soc_min) == null ? "-" : `${fmt(value(checks.soc_min, metrics.soc_min))} - ${fmt(value(checks.soc_max, metrics.soc_max))}`],
    [
      "电芯温度(℃)",
      value(checks.tbat_min_c, metrics.tbat_min_c) == null ? "-" : `${fmt(value(checks.tbat_min_c, metrics.tbat_min_c))} - ${fmt(value(checks.tbat_max_c, metrics.tbat_max_c))}`,
    ],
    [
      "电流限值越限(A)",
      value(checks.charge_current_limit_violation_max_a, metrics.charge_current_limit_violation_max_a) == null
        ? "-"
        : `${fmt(value(checks.charge_current_limit_violation_max_a, metrics.charge_current_limit_violation_max_a), 6)} / ${fmt(value(checks.discharge_current_limit_violation_max_a, metrics.discharge_current_limit_violation_max_a), 6)}`,
    ],
    ["功率平衡残差(kW)", fmt(value(checks.model_balance_max_kw, metrics.model_balance_max_kw), 6)],
    ["P_BESS后验偏差(kW)", fmt(value(checks.pbess_physical_max_kw, metrics.pbess_physical_max_kw), 6)],
    ["变量数", fmt(value(modelStats.variables_total, metrics.variables_total), 0)],
    ["二进制变量", fmt(value(modelStats.binary_variables, metrics.binary_variables), 0)],
    ["约束数", fmt(value(modelStats.constraints_total, metrics.constraints_total), 0)],
    ["时间步长(min)", fmt(value(modelStats.dt_minutes, metrics.dt_minutes))],
  ];
}

function renderResultFiles(files) {
  const source = Array.isArray(files) ? files : [];
  const workbookFiles = source.filter(
    (file) => String(file.name || file.href || "").toLowerCase().includes(".xlsx") || String(file.kind || "").toLowerCase() === "xlsx"
  );
  const list = workbookFiles.length ? workbookFiles : source;
  if (!list.length) {
    return `<div class="result-file-list empty">暂无结果文件</div>`;
  }
  return `
    <div class="result-file-list" aria-label="结果文件">
      ${list
        .map((file) => {
          const size = formatBytes(file.size_bytes);
          const href = file.href || "#";
          return `<a class="result-file-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">
            <span>${escapeHtml(file.label || file.name || "结果文件")}</span>
            <em>${escapeHtml(file.name || "")}${size ? ` · ${escapeHtml(size)}` : ""}</em>
          </a>`;
        })
        .join("")}
    </div>
  `;
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  if (number < 1024) return `${number} B`;
  if (number < 1024 * 1024) return `${(number / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(number / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
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
  const empty = !Number.isFinite(value);
  const safe = empty ? 8 : Math.max(8, Math.min(100, Math.abs(value) % 100 || 12));
  return `
    <div class="mini-bar-item${empty ? " empty" : ""}">
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
