const COMPARISON_SCOPE_GROUPS = [
  {
    key: "hour",
    label: "小时级曲线",
    match: (field) => !/variables|constraints|time_s|gap/.test(field.key),
  },
  {
    key: "safety",
    label: "安全曲线",
    match: (field) => /soc|tbat|t_bat|t_tank|t_cont|current|violation|balance|pbess/i.test(field.key),
  },
  {
    key: "day",
    label: "日级统计",
    match: (field) => /fuel|curt|heat|renewable|unserved|use|kwh|diesel|objective|gap/i.test(field.key),
  },
  {
    key: "month",
    label: "月度统计",
    match: (field) => /fuel|curt|heat|renewable|unserved|soc|tbat|t_bat|pbess|diesel/i.test(field.key),
  },
  {
    key: "year",
    label: "年度统计",
    match: () => true,
  },
];

const COMPARISON_RENDER_MODES = [
  { key: "table", label: "表格显示" },
  { key: "curve", label: "曲线对比" },
  { key: "bar", label: "柱图对比" },
];

const COMPARISON_COLORS = ["#64c8ff", "#8ee0a4", "#f4c45d", "#f07aaa", "#b090ff", "#58dfd6", "#ff9f43", "#d6e8ff"];

const comparisonState = {
  items: [],
  selectedIds: [],
  selected: [],
  fields: [],
  scope: "year",
  renderMode: "table",
  metricKey: "",
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshComparison")?.addEventListener("click", loadComparisonItems);
  document.getElementById("selectLatest")?.addEventListener("click", selectLatestItems);
  document.getElementById("clearSelection")?.addEventListener("click", clearComparisonSelection);
  document.getElementById("addComparisonSlot")?.addEventListener("click", addComparisonSlot);
  renderComparisonStaticControls();
  loadComparisonItems().catch(showComparisonError);
});

async function loadComparisonItems() {
  setError("comparisonError", "");
  const payload = await api("/api/comparison/items");
  comparisonState.items = payload.items || [];
  comparisonState.selectedIds = comparisonState.selectedIds.filter((id) => comparisonState.items.some((item) => item.id === id));
  if (!comparisonState.selectedIds.length) {
    comparisonState.selectedIds = comparisonState.items.slice(0, Math.min(5, comparisonState.items.length)).map((item) => item.id);
  }
  renderComparisonSlots();
  await loadComparisonData();
}

function renderComparisonStaticControls() {
  const scopes = document.getElementById("comparisonScopeTabs");
  const modes = document.getElementById("comparisonRenderTabs");
  if (scopes) {
    scopes.innerHTML = COMPARISON_SCOPE_GROUPS.map((scope) => `
      <button type="button" class="${scope.key === comparisonState.scope ? "active" : ""}" data-scope="${escapeHtml(scope.key)}">${escapeHtml(scope.label)}</button>
    `).join("");
    scopes.querySelectorAll("[data-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        comparisonState.scope = button.dataset.scope || "year";
        comparisonState.metricKey = "";
        renderComparisonData();
      });
    });
  }
  if (modes) {
    modes.innerHTML = COMPARISON_RENDER_MODES.map((mode) => `
      <button type="button" class="${mode.key === comparisonState.renderMode ? "active" : ""}" data-render-mode="${escapeHtml(mode.key)}">${escapeHtml(mode.label)}</button>
    `).join("");
    modes.querySelectorAll("[data-render-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        comparisonState.renderMode = button.dataset.renderMode || "table";
        renderComparisonData();
      });
    });
  }
}

function renderComparisonSlots() {
  const target = document.getElementById("comparisonSlotRail");
  if (!target) return;
  if (!comparisonState.items.length) {
    target.innerHTML = `<div class="comparison-empty">暂无可对比结果，请先完成优化调度或方案校核。</div>`;
    return;
  }
  if (!comparisonState.selectedIds.length) {
    target.innerHTML = `<div class="comparison-empty">点击“添加对比项”选择待对比结果。</div>`;
    return;
  }
  target.innerHTML = comparisonState.selectedIds.map((id, index) => {
    const item = itemById(id);
    return `
      <article class="comparison-slot">
        <div class="comparison-slot-head">
          <strong>对比${index + 1}</strong>
          <div class="comparison-slot-actions">
            <button type="button" title="前移" data-slot-move="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>‹</button>
            <button type="button" title="后移" data-slot-move="${index}" data-direction="1" ${index === comparisonState.selectedIds.length - 1 ? "disabled" : ""}>›</button>
            <button type="button" title="移除" data-slot-remove="${index}">×</button>
          </div>
        </div>
        <select data-slot-select="${index}">
          ${comparisonOptions(id)}
        </select>
        <span>${escapeHtml(item ? `${item.type_label} · ${item.status || ""}` : "请选择结果")}</span>
      </article>
    `;
  }).join("");
  target.querySelectorAll("[data-slot-select]").forEach((select) => {
    select.addEventListener("change", async () => {
      const index = Number.parseInt(select.dataset.slotSelect || "-1", 10);
      const nextId = select.value;
      if (index < 0 || !nextId) return;
      comparisonState.selectedIds[index] = nextId;
      comparisonState.selectedIds = uniqueOrdered(comparisonState.selectedIds);
      renderComparisonSlots();
      await loadComparisonData();
    });
  });
  target.querySelectorAll("[data-slot-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number.parseInt(button.dataset.slotRemove || "-1", 10);
      if (index < 0) return;
      comparisonState.selectedIds.splice(index, 1);
      renderComparisonSlots();
      await loadComparisonData();
    });
  });
  target.querySelectorAll("[data-slot-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number.parseInt(button.dataset.slotMove || "-1", 10);
      const direction = Number.parseInt(button.dataset.direction || "0", 10);
      moveComparisonSlot(index, direction);
      renderComparisonSlots();
      await loadComparisonData();
    });
  });
}

function comparisonOptions(currentId) {
  const used = new Set(comparisonState.selectedIds.filter((id) => id !== currentId));
  return comparisonState.items
    .filter((item) => item.id === currentId || !used.has(item.id))
    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === currentId ? "selected" : ""}>${escapeHtml(itemLabel(item))}</option>`)
    .join("");
}

function itemLabel(item) {
  const type = item.type === "verification" ? "校核" : "优化";
  return `${item.scheme || "未知方案"} / ${item.raw_id || ""} / ${type}`;
}

function itemShortLabel(item, index = 0) {
  const scheme = item?.scheme || "未知方案";
  const raw = String(item?.raw_id || "").slice(0, 8);
  return `${scheme}${raw ? ` / ${raw}` : ` ${index + 1}`}`;
}

function itemById(id) {
  return comparisonState.items.find((item) => item.id === id) || null;
}

function uniqueOrdered(ids) {
  const seen = new Set();
  return ids.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function moveComparisonSlot(index, direction) {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= comparisonState.selectedIds.length) return;
  const ids = comparisonState.selectedIds;
  [ids[index], ids[target]] = [ids[target], ids[index]];
}

async function addComparisonSlot() {
  const used = new Set(comparisonState.selectedIds);
  const next = comparisonState.items.find((item) => !used.has(item.id));
  if (!next) {
    showComparisonError(new Error("没有更多可添加的结果。"));
    return;
  }
  comparisonState.selectedIds.push(next.id);
  renderComparisonSlots();
  await loadComparisonData();
}

async function loadComparisonData() {
  const ids = comparisonState.selectedIds;
  const query = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  const payload = await api(`/api/comparison/data${query ? `?${query}` : ""}`);
  comparisonState.selected = payload.selected || [];
  comparisonState.fields = payload.fields || [];
  renderComparisonData();
}

function renderComparisonData() {
  renderComparisonStaticControls();
  renderComparisonSlots();
  const selected = comparisonState.selected || [];
  const fields = scopedFields();
  if (!comparisonState.metricKey || !fields.some((field) => field.key === comparisonState.metricKey)) {
    const firstPlottable = fields.find((field) => selected.some((item) => Number.isFinite(metricNumber(item.metrics?.[field.key]))));
    comparisonState.metricKey = firstPlottable?.key || fields[0]?.key || "";
  }
  renderComparisonMetricList(fields);
  renderComparisonHeader(selected, fields);
  renderComparisonLegend(selected);
  renderComparisonTable(selected, fields);
  renderComparisonCurve(selected, fields);
  renderComparisonBars(selected, fields);
  updateComparisonOutputVisibility();
}

function scopedFields() {
  const group = COMPARISON_SCOPE_GROUPS.find((scope) => scope.key === comparisonState.scope) || COMPARISON_SCOPE_GROUPS[0];
  const fields = (comparisonState.fields || []).filter((field) => group.match(field));
  return fields.length ? fields : comparisonState.fields || [];
}

function renderComparisonMetricList(fields) {
  const target = document.getElementById("comparisonMetricList");
  if (!target) return;
  if (!fields.length) {
    target.innerHTML = `<div class="comparison-empty">暂无指标</div>`;
    return;
  }
  target.innerHTML = fields.map((field) => `
    <button type="button" class="${field.key === comparisonState.metricKey ? "active" : ""}" data-metric-key="${escapeHtml(field.key)}">
      <span>${escapeHtml(field.label)}</span>
      <em>${escapeHtml(unitFromLabel(field.label) || "-")}</em>
    </button>
  `).join("");
  target.querySelectorAll("[data-metric-key]").forEach((button) => {
    button.addEventListener("click", () => {
      comparisonState.metricKey = button.dataset.metricKey || "";
      renderComparisonData();
    });
  });
}

function renderComparisonHeader(selected, fields) {
  const scope = COMPARISON_SCOPE_GROUPS.find((item) => item.key === comparisonState.scope);
  const metric = fields.find((field) => field.key === comparisonState.metricKey);
  document.getElementById("comparisonModeTitle").textContent = scope?.label || "指标对比";
  document.getElementById("comparisonTitle").textContent = selected.length ? `${scope?.label || "指标对比"} · ${COMPARISON_RENDER_MODES.find((mode) => mode.key === comparisonState.renderMode)?.label || ""}` : "请选择 1 个或多个结果";
  document.getElementById("comparisonMeta").textContent = selected.length
    ? `${selected.length} 个结果 · 当前指标：${metric?.label || "全部指标"}`
    : "点击顶部“添加对比项”选择结果。";
}

function renderComparisonLegend(selected) {
  const target = document.getElementById("comparisonLegend");
  if (!target) return;
  target.innerHTML = selected.map((item, index) => `
    <span><i style="background:${COMPARISON_COLORS[index % COMPARISON_COLORS.length]}"></i>${escapeHtml(itemShortLabel(item, index))}</span>
  `).join("");
}

function renderComparisonTable(selected, fields) {
  const target = document.getElementById("comparisonTable");
  if (!target) return;
  if (!selected.length) {
    target.innerHTML = `<div class="comparison-empty">请添加待对比结果。</div>`;
    return;
  }
  const rows = fields.length ? fields : comparisonState.fields;
  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>指标</th>
          <th>单位</th>
          ${selected.map((item, index) => `<th>${escapeHtml(itemShortLabel(item, index))}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        <tr><th>状态</th><td>-</td>${selected.map((item) => `<td>${escapeHtml(item.status || "-")}</td>`).join("")}</tr>
        ${rows.map((field) => `
          <tr class="${field.key === comparisonState.metricKey ? "selected-row" : ""}">
            <th>${escapeHtml(field.label)}</th>
            <td>${escapeHtml(unitFromLabel(field.label) || "-")}</td>
            ${selected.map((item) => `<td>${escapeHtml(fmt(item.metrics?.[field.key], 6))}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderComparisonCurve(selected, fields) {
  const target = document.getElementById("comparisonCurve");
  if (!target) return;
  const field = fields.find((item) => item.key === comparisonState.metricKey) || fields[0];
  if (!selected.length || !field) {
    target.innerHTML = `<div class="comparison-empty">暂无可绘制曲线。</div>`;
    return;
  }
  const points = selected.map((item, index) => ({
    label: itemShortLabel(item, index),
    value: metricNumber(item.metrics?.[field.key]),
  }));
  target.innerHTML = comparisonCurveSvg(field, points);
}

function renderComparisonBars(selected, fields) {
  const target = document.getElementById("comparisonBars");
  if (!target) return;
  const field = fields.find((item) => item.key === comparisonState.metricKey) || fields[0];
  if (!selected.length || !field) {
    target.innerHTML = `<div class="comparison-empty">暂无可绘制柱状图。</div>`;
    return;
  }
  const values = selected.map((item, index) => ({
    label: itemShortLabel(item, index),
    type: item.type,
    value: metricNumber(item.metrics?.[field.key]),
    color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
  }));
  target.innerHTML = comparisonBarSvg(field, values);
}

function updateComparisonOutputVisibility() {
  const table = document.getElementById("comparisonTable");
  const curve = document.getElementById("comparisonCurve");
  const bars = document.getElementById("comparisonBars");
  if (table) table.hidden = comparisonState.renderMode !== "table";
  if (curve) curve.hidden = comparisonState.renderMode !== "curve";
  if (bars) bars.hidden = comparisonState.renderMode !== "bar";
}

function comparisonCurveSvg(field, points) {
  const width = 1120;
  const height = 560;
  const margin = { left: 88, right: 34, top: 42, bottom: 92 };
  const finite = points.filter((point) => Number.isFinite(point.value));
  if (!finite.length) return `<div class="comparison-empty">当前指标没有数值数据。</div>`;
  const minX = 0;
  const maxX = Math.max(points.length - 1, 1);
  let minY = Math.min(...finite.map((point) => point.value), 0);
  let maxY = Math.max(...finite.map((point) => point.value), 1);
  if (minY === maxY) {
    minY -= Math.abs(minY) || 1;
    maxY += Math.abs(maxY) || 1;
  }
  const pad = (maxY - minY) * 0.1;
  minY -= pad;
  maxY += pad;
  const xScale = (index) => margin.left + (index - minX) / (maxX - minX) * (width - margin.left - margin.right);
  const yScale = (value) => margin.top + (1 - (value - minY) / (maxY - minY)) * (height - margin.top - margin.bottom);
  const gridY = Array.from({ length: 5 }, (_, index) => minY + (maxY - minY) * index / 4);
  const path = points.map((point, index) => Number.isFinite(point.value) ? `${index === 0 ? "M" : "L"}${xScale(index).toFixed(2)},${yScale(point.value).toFixed(2)}` : "").filter(Boolean).join(" ");
  return `
    <svg class="comparison-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(field.label)}曲线对比">
      <rect class="comparison-chart-bg" x="0" y="0" width="${width}" height="${height}" rx="8"></rect>
      ${gridY.map((value) => `
        <line class="comparison-grid" x1="${margin.left}" y1="${yScale(value).toFixed(2)}" x2="${width - margin.right}" y2="${yScale(value).toFixed(2)}"></line>
        <text class="comparison-axis" x="${margin.left - 12}" y="${(yScale(value) + 4).toFixed(2)}" text-anchor="end">${escapeHtml(fmt(value, 4))}</text>
      `).join("")}
      ${points.map((point, index) => `
        <line class="comparison-grid vertical" x1="${xScale(index).toFixed(2)}" y1="${margin.top}" x2="${xScale(index).toFixed(2)}" y2="${height - margin.bottom}"></line>
        <text class="comparison-x-label" x="${xScale(index).toFixed(2)}" y="${height - 48}" text-anchor="middle">${escapeHtml(truncateLabel(point.label, 16))}</text>
      `).join("")}
      <path class="comparison-line-shadow" d="${path}"></path>
      <path class="comparison-line" d="${path}"></path>
      ${points.map((point, index) => Number.isFinite(point.value) ? `
        <circle cx="${xScale(index).toFixed(2)}" cy="${yScale(point.value).toFixed(2)}" r="5" fill="${COMPARISON_COLORS[index % COMPARISON_COLORS.length]}"></circle>
        <text class="comparison-point-label" x="${xScale(index).toFixed(2)}" y="${(yScale(point.value) - 12).toFixed(2)}" text-anchor="middle">${escapeHtml(fmt(point.value, 4))}</text>
      ` : "").join("")}
      <text class="comparison-chart-title" x="${margin.left}" y="24">${escapeHtml(field.label)} · ${escapeHtml(unitFromLabel(field.label) || "")}</text>
    </svg>
  `;
}

function comparisonBarSvg(field, values) {
  const width = 1120;
  const height = 560;
  const margin = { left: 88, right: 34, top: 42, bottom: 92 };
  const finite = values.filter((item) => Number.isFinite(item.value));
  if (!finite.length) return `<div class="comparison-empty">当前指标没有数值数据。</div>`;
  const maxValue = Math.max(...finite.map((item) => Math.abs(item.value)), 1e-9);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const slot = plotWidth / Math.max(values.length, 1);
  const barWidth = Math.min(54, slot * 0.46);
  const gridY = Array.from({ length: 5 }, (_, index) => maxValue * index / 4);
  const yScale = (value) => margin.top + (1 - value / maxValue) * plotHeight;
  return `
    <svg class="comparison-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(field.label)}柱状对比">
      <rect class="comparison-chart-bg" x="0" y="0" width="${width}" height="${height}" rx="8"></rect>
      ${gridY.map((value) => `
        <line class="comparison-grid" x1="${margin.left}" y1="${yScale(value).toFixed(2)}" x2="${width - margin.right}" y2="${yScale(value).toFixed(2)}"></line>
        <text class="comparison-axis" x="${margin.left - 12}" y="${(yScale(value) + 4).toFixed(2)}" text-anchor="end">${escapeHtml(fmt(value, 4))}</text>
      `).join("")}
      ${values.map((item, index) => {
        const value = Number.isFinite(item.value) ? Math.abs(item.value) : 0;
        const barHeight = value / maxValue * plotHeight;
        const x = margin.left + index * slot + (slot - barWidth) / 2;
        const y = margin.top + plotHeight - barHeight;
        return `
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="3" fill="${item.color}"></rect>
          <text class="comparison-point-label" x="${(x + barWidth / 2).toFixed(2)}" y="${Math.max(margin.top + 12, y - 10).toFixed(2)}" text-anchor="middle">${escapeHtml(Number.isFinite(item.value) ? fmt(item.value, 4) : "-")}</text>
          <text class="comparison-x-label" x="${(x + barWidth / 2).toFixed(2)}" y="${height - 48}" text-anchor="middle">${escapeHtml(truncateLabel(item.label, 16))}</text>
        `;
      }).join("")}
      <text class="comparison-chart-title" x="${margin.left}" y="24">${escapeHtml(field.label)} · ${escapeHtml(unitFromLabel(field.label) || "")}</text>
    </svg>
  `;
}

function metricNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function unitFromLabel(label) {
  const text = String(label || "");
  const match = text.match(/[（(]([^()（）]+)[）)]/);
  if (match) return match[1];
  if (/SOC|Gap|占比|率/.test(text)) return "";
  if (/燃油|耗油/.test(text)) return "kg";
  if (/电流/.test(text)) return "A";
  if (/温度/.test(text)) return "℃";
  if (/功率|出力|残差/.test(text)) return "kW";
  if (/时间/.test(text)) return "s";
  if (/变量|约束|步/.test(text)) return "个";
  return "";
}

function truncateLabel(value, limit) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function selectLatestItems() {
  comparisonState.selectedIds = comparisonState.items.slice(0, Math.min(5, comparisonState.items.length)).map((item) => item.id);
  renderComparisonSlots();
  loadComparisonData().catch(showComparisonError);
}

function clearComparisonSelection() {
  comparisonState.selectedIds = [];
  comparisonState.selected = [];
  renderComparisonData();
}

function showComparisonError(error) {
  setError("comparisonError", error.message || "操作失败");
}
