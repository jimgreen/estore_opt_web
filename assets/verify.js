const DISPATCH_BINARY_KEYS = new Set(["u_pi", "u_po", "u_lh", "u_ch"]);
const DISPATCH_READONLY_KEYS = new Set(["pack_current_a"]);

const verifyState = {
  schemes: [],
  optimizationItems: [],
  dispatch: null,
  verifications: [],
  selectedId: "",
  selectedItem: null,
  timer: 0,
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("verifyForm")?.addEventListener("submit", startVerification);
  document.getElementById("queueVerificationTask")?.addEventListener("click", queueVerification);
  document.getElementById("stopVerificationTask")?.addEventListener("click", cancelSelectedVerification);
  document.getElementById("cancelVerificationTask")?.addEventListener("click", cancelSelectedVerification);
  document.getElementById("reloadDispatchSchedule")?.addEventListener("click", () => loadDispatchSchedule().catch(showVerifyError));
  document.getElementById("initDispatchSchedule")?.addEventListener("click", initializeDispatchSchedule);
  document.getElementById("saveDispatchSchedule")?.addEventListener("click", saveDispatchSchedule);
  document.getElementById("createDispatchScheme")?.addEventListener("click", createDispatchSchemeFromOptimization);
  document.getElementById("saveDispatchAsScheme")?.addEventListener("click", saveDispatchAsScheme);
  document.querySelector("#verifyForm select[name='scheme']")?.addEventListener("change", () => loadDispatchSchedule().catch(showVerifyError));
  document.getElementById("optimizationTaskSelect")?.addEventListener("change", applyOptimizationDefaultName);

  initializeVerifyPage().catch(showVerifyError);
  verifyState.timer = window.setInterval(loadVerifications, 4000);
});

async function initializeVerifyPage() {
  const params = new URLSearchParams(window.location.search);
  verifyState.selectedId = params.get("verification") || "";
  await loadSchemes(params.get("scheme") || "");
  await loadOptimizationItems();
  await loadVerifications();
}

async function loadSchemes(preferredScheme = "") {
  const payload = await api("/api/schemes");
  verifyState.schemes = payload.schemes || [];
  const select = document.querySelector("#verifyForm select[name='scheme']");
  const previous = preferredScheme || select?.value || "";
  const names = verifyState.schemes.map((scheme) => scheme.name);
  const selected = names.includes(previous) ? previous : names[0] || "";
  if (select) {
    select.innerHTML = verifyState.schemes.map((scheme) => `<option value="${escapeHtml(scheme.name)}">${escapeHtml(scheme.name)}</option>`).join("");
    select.value = selected;
  }
  if (selected) await loadDispatchSchedule(selected);
}

function currentScheme() {
  return document.querySelector("#verifyForm select[name='scheme']")?.value || "";
}

async function loadDispatchSchedule(scheme = currentScheme()) {
  if (!scheme) {
    verifyState.dispatch = null;
    renderDispatchSchedule();
    return null;
  }
  const payload = await api(`/api/dispatch-schedule?scheme=${encodeURIComponent(scheme)}`);
  verifyState.dispatch = payload;
  renderDispatchSchedule();
  return payload;
}

function renderDispatchSchedule() {
  renderDispatchStatus();
  renderDispatchScheduleTable();
}

function renderDispatchStatus() {
  const state = document.getElementById("dispatchFileState");
  const meta = document.getElementById("dispatchFileMeta");
  const dispatch = verifyState.dispatch;
  if (!dispatch) {
    if (state) state.textContent = "未加载";
    if (meta) meta.textContent = "请选择方案。";
    return;
  }
  if (state) state.textContent = dispatch.exists ? "已加载 dispatch_schedule.xlsx" : "未创建 dispatch_schedule.xlsx";
  if (meta) {
    const fileName = dispatch.path ? dispatch.path.split(/[\\/]/).pop() : "dispatch_schedule.xlsx";
    meta.textContent = dispatch.exists ? `${dispatch.scheme} · ${fileName} · ${dispatch.row_count || 0} 行` : `${dispatch.scheme} 尚无独立调度控制曲线文件。`;
  }
}

function renderDispatchScheduleTable() {
  const target = document.getElementById("dispatchScheduleTable");
  const dispatch = verifyState.dispatch;
  if (!target) return;
  if (!dispatch) {
    target.innerHTML = `<div class="scheme-item">请选择方案后加载调度控制曲线。</div>`;
    return;
  }
  const headers = dispatch.headers || [];
  const rows = dispatch.rows || [];
  if (!dispatch.exists) {
    target.innerHTML = `<div class="scheme-item">当前方案没有 dispatch_schedule.xlsx。可以生成空白调度文件，或从已完成的优化结果生成新的调度方案。</div>`;
    return;
  }
  if (!rows.length) {
    target.innerHTML = `<div class="scheme-item">调度控制曲线为空。</div>`;
    return;
  }
  target.innerHTML = `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row, rowIndex) => `
          <tr>
            ${headers.map((header) => renderDispatchCell(row, rowIndex, header)).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  target.querySelectorAll("[data-dispatch-row]").forEach((control) => {
    const eventName = control.tagName === "SELECT" ? "change" : "input";
    control.addEventListener(eventName, () => updateDispatchValue(control));
  });
}

function renderDispatchCell(row, rowIndex, header) {
  const key = header.key;
  const value = row[key];
  if (DISPATCH_READONLY_KEYS.has(key)) {
    return `<td><span class="readonly-cell">${escapeHtml(fmt(value, 6))}</span></td>`;
  }
  if (DISPATCH_BINARY_KEYS.has(key)) {
    const normalized = Number(value || 0) > 0 ? "1" : "0";
    return `
      <td>
        <select data-dispatch-row="${rowIndex}" data-dispatch-key="${escapeHtml(key)}">
          <option value="0" ${normalized === "0" ? "selected" : ""}>停</option>
          <option value="1" ${normalized === "1" ? "selected" : ""}>启</option>
        </select>
      </td>
    `;
  }
  return `
    <td>
      <input data-dispatch-row="${rowIndex}" data-dispatch-key="${escapeHtml(key)}" type="number" step="any" value="${escapeHtml(value ?? "")}">
    </td>
  `;
}

function updateDispatchValue(control) {
  const dispatch = verifyState.dispatch;
  const rowIndex = Number.parseInt(control.dataset.dispatchRow || "-1", 10);
  const key = control.dataset.dispatchKey || "";
  if (!dispatch || !dispatch.rows || rowIndex < 0 || rowIndex >= dispatch.rows.length || !key) return;
  const raw = control.value;
  dispatch.rows[rowIndex][key] = raw === "" ? null : Number(raw);
}

function collectDispatchRows() {
  const rows = (verifyState.dispatch?.rows || []).map((row) => {
    const next = { ...row };
    next.pack_current_a = null;
    return next;
  });
  return rows;
}

async function initializeDispatchSchedule() {
  const scheme = currentScheme();
  if (!scheme) return;
  try {
    const payload = await api("/api/dispatch-schedule/init", {
      method: "POST",
      body: JSON.stringify({ scheme }),
    });
    verifyState.dispatch = payload;
    await loadSchemes(scheme);
  } catch (error) {
    showVerifyError(error);
  }
}

async function saveDispatchSchedule() {
  const scheme = currentScheme();
  if (!scheme || !verifyState.dispatch?.exists) return;
  try {
    const payload = await api("/api/dispatch-schedule", {
      method: "PUT",
      body: JSON.stringify({ scheme, rows: collectDispatchRows() }),
    });
    verifyState.dispatch = payload;
    renderDispatchSchedule();
  } catch (error) {
    showVerifyError(error);
  }
}

async function loadOptimizationItems() {
  try {
    const payload = await api("/api/comparison/items");
    verifyState.optimizationItems = (payload.items || []).filter((item) => item.type === "optimization" && item.raw_id && item.success !== false);
    renderOptimizationSelect();
  } catch (error) {
    verifyState.optimizationItems = [];
    renderOptimizationSelect();
  }
}

function renderOptimizationSelect() {
  const select = document.getElementById("optimizationTaskSelect");
  if (!select) return;
  if (!verifyState.optimizationItems.length) {
    select.innerHTML = `<option value="">暂无可用优化结果</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = `<option value="">选择优化结果</option>${verifyState.optimizationItems.map((item) => `
    <option value="${escapeHtml(item.raw_id)}">${escapeHtml(optimizationItemLabel(item))}</option>
  `).join("")}`;
}

function optimizationItemLabel(item) {
  return `${item.scheme || "未知方案"} · ${item.status || ""} · ${item.created_at || item.mtime || item.raw_id}`;
}

function selectedOptimizationItem() {
  const id = document.getElementById("optimizationTaskSelect")?.value || "";
  return verifyState.optimizationItems.find((item) => item.raw_id === id) || null;
}

function defaultDispatchSchemeName(item) {
  const base = (item?.scheme || currentScheme() || "校核方案").replace(/[\\/:*?"<>|]/g, "").slice(0, 48) || "校核方案";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `${base}_调度_${stamp}`;
}

function applyOptimizationDefaultName() {
  const input = document.getElementById("dispatchSchemeName");
  if (!input || input.value.trim()) return;
  const item = selectedOptimizationItem();
  if (item) input.value = defaultDispatchSchemeName(item);
}

async function createDispatchSchemeFromOptimization() {
  const item = selectedOptimizationItem();
  if (!item) {
    showVerifyError(new Error("请选择一个已完成的优化结果。"));
    return;
  }
  const nameInput = document.getElementById("dispatchSchemeName");
  const descInput = document.getElementById("dispatchSchemeDescription");
  const targetName = nameInput?.value.trim() || defaultDispatchSchemeName(item);
  try {
    const payload = await api("/api/dispatch-schedule/from-optimization", {
      method: "POST",
      body: JSON.stringify({
        task_id: item.raw_id,
        name: targetName,
        description: descInput?.value.trim() || `由优化结果 ${item.raw_id} 生成的校核调度方案`,
      }),
    });
    const newName = payload.scheme?.name || targetName;
    await loadSchemes(newName);
    await loadOptimizationItems();
  } catch (error) {
    showVerifyError(error);
  }
}

async function saveDispatchAsScheme() {
  const source = currentScheme();
  const nameInput = document.getElementById("dispatchSchemeName");
  const descInput = document.getElementById("dispatchSchemeDescription");
  const targetName = nameInput?.value.trim() || "";
  if (!source || !verifyState.dispatch?.exists) return;
  if (!targetName) {
    showVerifyError(new Error("请填写新方案名称。"));
    return;
  }
  try {
    const copied = await api("/api/schemes/copy", {
      method: "POST",
      body: JSON.stringify({
        source,
        name: targetName,
        description: descInput?.value.trim() || `由 ${source} 的调度控制曲线另存`,
      }),
    });
    const newName = copied.scheme?.name || targetName;
    const payload = await api("/api/dispatch-schedule", {
      method: "PUT",
      body: JSON.stringify({ scheme: newName, rows: collectDispatchRows() }),
    });
    verifyState.dispatch = payload;
    await loadSchemes(newName);
  } catch (error) {
    showVerifyError(error);
  }
}

async function startVerification(event) {
  event.preventDefault();
  await submitVerification("single-start");
}

async function queueVerification() {
  await submitVerification("single-queue");
}

async function submitVerification(source) {
  setError("verifyError", "");
  const cfg = formConfig(document.getElementById("verifyForm"));
  const scheme = cfg.scheme;
  delete cfg.scheme;
  try {
    const dispatch = verifyState.dispatch?.scheme === scheme ? verifyState.dispatch : await loadDispatchSchedule(scheme);
    if (!dispatch?.exists) {
      throw new Error("当前方案缺少 dispatch_schedule.xlsx，请先生成或保存调度控制曲线文件。");
    }
    const payload = await api("/api/verification/start", {
      method: "POST",
      body: JSON.stringify({ scheme, config: cfg, source }),
    });
    verifyState.selectedId = payload.verification.id;
    applyVerifications(payload.verifications || []);
    await loadVerificationDetail(verifyState.selectedId);
  } catch (error) {
    showVerifyError(error);
  }
}

async function loadVerifications() {
  try {
    const payload = await api("/api/verification");
    applyVerifications(payload.verifications || []);
    if (verifyState.selectedId) await loadVerificationDetail(verifyState.selectedId);
  } catch (error) {
    showVerifyError(error);
  }
}

function applyVerifications(items) {
  verifyState.verifications = items;
  if (!verifyState.selectedId && items[0]) verifyState.selectedId = items[0].id;
  renderVerificationList();
}

function renderVerificationList() {
  const target = document.getElementById("verificationList");
  if (!target) return;
  if (!verifyState.verifications.length) {
    target.innerHTML = `<div class="task-item"><strong>暂无校核任务</strong><span>启动方案校核后会显示在这里。</span></div>`;
    return;
  }
  target.innerHTML = verifyState.verifications.map((item) => `
    <button class="task-item ${item.id === verifyState.selectedId ? "active" : ""}" type="button" data-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.scheme)}</strong>
      <span>${escapeHtml(item.created_at)} · ${escapeHtml(item.config?.mode || "")}</span>
      <span class="status-pill ${verificationStatusClass(item.status)}">${escapeHtml(item.status)}</span>
    </button>
  `).join("");
  target.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      verifyState.selectedId = button.dataset.id || "";
      renderVerificationList();
      loadVerificationDetail(verifyState.selectedId).catch(showVerifyError);
    });
  });
}

async function loadVerificationDetail(id) {
  if (!id) return;
  const item = await api(`/api/verification/item?id=${encodeURIComponent(id)}`);
  verifyState.selectedItem = item;
  document.getElementById("verificationTitle").textContent = `${item.scheme} · ${item.status}`;
  document.getElementById("stopVerificationTask").disabled = !item.can_cancel;
  document.getElementById("cancelVerificationTask").disabled = !item.can_cancel;
  renderVerificationMetrics(item.metrics || {});
  document.getElementById("verificationSummary").textContent = item.summary_text || item.latest_log || "暂无摘要。";
  renderVerificationRows(item.rows || item.rows_preview || []);
}

async function cancelSelectedVerification() {
  if (!verifyState.selectedId) return;
  try {
    await api("/api/verification/cancel", { method: "POST", body: JSON.stringify({ id: verifyState.selectedId }) });
    await loadVerifications();
  } catch (error) {
    showVerifyError(error);
  }
}

function renderVerificationMetrics(metrics) {
  const diesel = metrics.diesel || {};
  const renewable = metrics.renewable || {};
  const violations = metrics.violations || {};
  const fields = [
    ["状态", metrics.status],
    ["步长(min)", metrics.dt_minutes],
    ["时刻数", metrics.steps],
    ["柴油实际耗油(kg)", diesel.fuel_kg],
    ["柴油最大出力(kW)", diesel.max_kw],
    ["新能源消纳(kWh)", sumValues(renewable.pv_use_kwh, renewable.wt_use_kwh)],
    ["新能源弃电(kWh)", sumValues(renewable.pv_curt_kwh, renewable.wt_curt_kwh)],
    ["未供电量(kWh)", renewable.unserved_kwh],
    ["SOC越限", violations.soc_max],
    ["充电电流越限(A)", violations.charge_current_max_a],
    ["放电电流越限(A)", violations.discharge_current_max_a],
    ["电芯温度越限(℃)", violations.t_bat_max_c],
    ["SOC最大偏差", metrics.soc?.max_abs],
    ["SOC MAE", metrics.soc?.mae],
    ["电芯温度最大偏差(℃)", metrics.t_bat_c?.max_abs],
    ["BESS功率最大偏差(kW)", metrics.pbess_kw?.max_abs],
  ];
  document.getElementById("verificationMetrics").innerHTML = fields.map(([label, value]) => `
    <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(fmt(value, 6))}</strong></div>
  `).join("");
}

function sumValues(...values) {
  const present = values.filter((value) => value !== null && value !== undefined && value !== "").map(Number).filter(Number.isFinite);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function renderVerificationRows(rows) {
  const target = document.getElementById("verificationRows");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="scheme-item">暂无逐时刻数据。</div>`;
    return;
  }
  const columns = [
    ["step", "步"],
    ["hour", "小时"],
    ["i_cell_a", "电芯电流(A)"],
    ["pbess_sim_kw", "BESS实际(kW)"],
    ["pbess_ref_kw", "BESS参考(kW)"],
    ["pbess_error_kw", "BESS偏差(kW)"],
    ["soc_sim", "SOC实际"],
    ["soc_ref", "SOC参考"],
    ["soc_error", "SOC偏差"],
    ["t_bat_sim_c", "电芯温度(℃)"],
    ["t_bat_ref_c", "电芯温度参考(℃)"],
    ["t_bat_error_c", "温度偏差(℃)"],
    ["diesel_actual_kw", "柴油实际(kW)"],
    ["pv_use_actual_kw", "光伏消纳(kW)"],
    ["wt_use_actual_kw", "风电消纳(kW)"],
    ["pv_curt_actual_kw", "弃光(kW)"],
    ["wt_curt_actual_kw", "弃风(kW)"],
    ["unserved_kw", "未供电(kW)"],
    ["soc_violation", "SOC越限"],
    ["charge_current_violation_a", "充电越限(A)"],
    ["discharge_current_violation_a", "放电越限(A)"],
  ];
  target.innerHTML = `
    <table>
      <thead>
        <tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${columns.map(([key]) => `<td>${escapeHtml(fmt(row[key], 6))}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function verificationStatusClass(status) {
  if (status === "校核中") return "running";
  if (status === "排队中") return "queued";
  if (status === "完成校核") return "done";
  if (["校核失败", "校核中止", "退出队列"].includes(status)) return "failed";
  return "";
}

function showVerifyError(error) {
  setError("verifyError", error.message || "操作失败");
}
