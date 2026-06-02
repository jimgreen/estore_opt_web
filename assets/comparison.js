const comparisonState = {
  items: [],
  selectedIds: new Set(),
  showOptimization: true,
  showVerification: true,
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshComparison")?.addEventListener("click", loadComparisonItems);
  document.getElementById("selectLatest")?.addEventListener("click", selectLatestItems);
  document.getElementById("clearSelection")?.addEventListener("click", clearComparisonSelection);
  document.getElementById("showOptimization")?.addEventListener("change", updateComparisonFilters);
  document.getElementById("showVerification")?.addEventListener("change", updateComparisonFilters);
  loadComparisonItems().catch(showComparisonError);
});

async function loadComparisonItems() {
  setError("comparisonError", "");
  const payload = await api("/api/comparison/items");
  comparisonState.items = payload.items || [];
  if (!comparisonState.selectedIds.size) {
    comparisonState.items.slice(0, Math.min(3, comparisonState.items.length)).forEach((item) => comparisonState.selectedIds.add(item.id));
  }
  renderComparisonItems();
  await loadComparisonData();
}

function updateComparisonFilters() {
  comparisonState.showOptimization = document.getElementById("showOptimization").checked;
  comparisonState.showVerification = document.getElementById("showVerification").checked;
  renderComparisonItems();
}

function filteredComparisonItems() {
  return comparisonState.items.filter((item) => {
    if (item.type === "optimization" && !comparisonState.showOptimization) return false;
    if (item.type === "verification" && !comparisonState.showVerification) return false;
    return true;
  });
}

function renderComparisonItems() {
  const target = document.getElementById("comparisonItemList");
  const items = filteredComparisonItems();
  if (!items.length) {
    target.innerHTML = `<div class="task-item"><strong>暂无结果</strong><span>请先完成优化求解或方案校核。</span></div>`;
    return;
  }
  target.innerHTML = items.map((item) => `
    <label class="comparison-item ${comparisonState.selectedIds.has(item.id) ? "active" : ""}">
      <input type="checkbox" value="${escapeHtml(item.id)}" ${comparisonState.selectedIds.has(item.id) ? "checked" : ""}>
      <span class="result-type ${item.type}">${escapeHtml(item.type_label)}</span>
      <strong>${escapeHtml(item.scheme || "未知方案")}</strong>
      <em>${escapeHtml(item.raw_id)}</em>
      <small>${escapeHtml(item.created_at || item.mtime || "")} · ${escapeHtml(item.status || "")}</small>
    </label>
  `).join("");
  target.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      if (checkbox.checked) comparisonState.selectedIds.add(checkbox.value);
      else comparisonState.selectedIds.delete(checkbox.value);
      renderComparisonItems();
      await loadComparisonData();
    });
  });
}

async function loadComparisonData() {
  const ids = Array.from(comparisonState.selectedIds);
  const query = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  const payload = await api(`/api/comparison/data${query ? `?${query}` : ""}`);
  renderComparisonData(payload);
}

function renderComparisonData(payload) {
  const selected = payload.selected || [];
  const fields = payload.fields || [];
  document.getElementById("comparisonTitle").textContent = selected.length ? `已选择 ${selected.length} 个结果` : "请选择 1 个或多个结果";
  renderComparisonSummaryCards(selected);
  renderComparisonTable(selected, fields);
  renderComparisonBars(selected, fields);
}

function renderComparisonSummaryCards(selected) {
  const optCount = selected.filter((item) => item.type === "optimization").length;
  const verifyCount = selected.filter((item) => item.type === "verification").length;
  const bestFuel = bestMetric(selected, "fuel_kg", "min");
  const bestGap = bestMetric(selected, "gap", "min");
  const cards = [
    ["选择结果", selected.length],
    ["优化求解", optCount],
    ["方案校核", verifyCount],
    ["最小燃油(kg)", bestFuel],
    ["最小Gap", bestGap],
  ];
  document.getElementById("comparisonSummaryCards").innerHTML = cards.map(([label, value]) => `
    <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(fmt(value, 6))}</strong></div>
  `).join("");
}

function bestMetric(items, key, mode) {
  const values = items.map((item) => metricNumber(item.metrics?.[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return mode === "max" ? Math.max(...values) : Math.min(...values);
}

function renderComparisonTable(selected, fields) {
  const target = document.getElementById("comparisonTable");
  if (!selected.length) {
    target.innerHTML = `<div class="task-item">请在左侧选择结果。</div>`;
    return;
  }
  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>指标</th>
          ${selected.map((item) => `<th>${escapeHtml(item.type_label)}<br>${escapeHtml(item.scheme || "未知方案")}<br>${escapeHtml(item.raw_id)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        <tr><th>状态</th>${selected.map((item) => `<td>${escapeHtml(item.status || "-")}</td>`).join("")}</tr>
        <tr><th>输出目录</th>${selected.map((item) => `<td>${escapeHtml(item.output_dir || "-")}</td>`).join("")}</tr>
        ${fields.map((field) => `
          <tr>
            <th>${escapeHtml(field.label)}</th>
            ${selected.map((item) => `<td>${escapeHtml(fmt(item.metrics?.[field.key], 6))}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderComparisonBars(selected, fields) {
  const target = document.getElementById("comparisonBars");
  const barFields = fields.filter((field) => selected.some((item) => Number.isFinite(metricNumber(item.metrics?.[field.key])))).slice(0, 8);
  if (!selected.length || !barFields.length) {
    target.innerHTML = `<div class="task-item">暂无可绘制指标。</div>`;
    return;
  }
  target.innerHTML = barFields.map((field) => {
    const values = selected.map((item) => metricNumber(item.metrics?.[field.key]));
    const finite = values.filter(Number.isFinite);
    const maxAbs = Math.max(...finite.map((value) => Math.abs(value)), 1e-9);
    return `
      <div class="bar-group">
        <h4>${escapeHtml(field.label)}</h4>
        ${selected.map((item, index) => {
          const value = values[index];
          const width = Number.isFinite(value) ? Math.max(2, Math.abs(value) / maxAbs * 100) : 0;
          return `
            <div class="bar-row">
              <span>${escapeHtml(item.scheme || item.raw_id)}</span>
              <div class="bar-track"><div class="bar-fill ${item.type}" style="width:${width}%"></div></div>
              <em>${escapeHtml(Number.isFinite(value) ? fmt(value, 6) : "-")}</em>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }).join("");
}

function metricNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function selectLatestItems() {
  comparisonState.selectedIds.clear();
  filteredComparisonItems().slice(0, 4).forEach((item) => comparisonState.selectedIds.add(item.id));
  renderComparisonItems();
  loadComparisonData().catch(showComparisonError);
}

function clearComparisonSelection() {
  comparisonState.selectedIds.clear();
  renderComparisonItems();
  loadComparisonData().catch(showComparisonError);
}

function showComparisonError(error) {
  setError("comparisonError", error.message || "操作失败");
}
