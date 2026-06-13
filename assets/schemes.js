const schemeState = {
  schemes: [],
  current: "",
  sheets: [],
  currentSheet: "",
  rows: [],
  computeConfig: {},
  search: "",
  contextScheme: "",
  selectedRowIndex: 0,
  selectedExcelRow: 0,
  sheetMeta: {},
  sheetPage: 1,
  sheetPageSize: 200,
  pendingCellUpdates: {},
  visibleCurves: {},
  selectedCurveKey: "",
  sheetCurveMeta: null,
  sheetCurveDrag: null,
  sheetCurveRenderFrame: 0,
  windCurveRows: [],
  dieselCurveRows: [],
  computeConfigEditingKey: "",
  expandedSchemes: {},
  schemeMetaDialog: { mode: "", source: "" },
};

const sheetCurveColors = ["#27d7b5", "#72a7ff", "#ffbd73", "#c78bff", "#5ee39b", "#ff7b72", "#f4d35e", "#8ee3f5"];
const sheetsWithoutCurves = new Set(["光伏机组", "舱体", "液冷系统", "电芯电流限值", "电芯", "电池柜", "配电模块", "系统定义", "计算参数"]);
const WIND_TURBINE_SHEET_NAME = "风电机组";
const DIESEL_GENERATOR_SHEET_NAME = "柴油发电机";
const CELL_RESISTANCE_SHEET_NAME = "电芯内阻";
const CELL_OCV_SHEET_NAME = "电芯OCV";
const OPERATION_CURVE_SHEET_NAME = "运行曲线";
const curveBelowTableSheets = new Set([
  WIND_TURBINE_SHEET_NAME,
  DIESEL_GENERATOR_SHEET_NAME,
  CELL_RESISTANCE_SHEET_NAME,
  CELL_OCV_SHEET_NAME,
  OPERATION_CURVE_SHEET_NAME,
]);

const computeConfigFields = [
  { key: "solver", label: "求解器", type: "select", options: ["auto", "cplex", "gurobi", "mosek"] },
  { key: "mode", label: "模式", type: "select", options: ["dayahead_24h", "test_1h", "test_4h", "full_more_coolant_20260512", "minute_more_coolant_20260512"] },
  { key: "experiment", label: "实验配置", type: "select", options: ["perspective_i2r_block20", "perspective_i2r_strict_block20", "fuel_only_block20", "fuel_only_tight_block20", "baseline"] },
  { key: "dt_minutes", label: "时间步长(分钟)", type: "number", step: "1" },
  { key: "time_limit", label: "时间上限(秒)", type: "number", step: "1" },
  { key: "mip_gap", label: "MIP Gap", type: "number", step: "0.001" },
  { key: "current_segments", label: "电流分段数", type: "number", step: "1" },
  { key: "current_mode", label: "电流模式", type: "select", options: ["continuous", "discrete"] },
  { key: "soc_grid_width", label: "SOC网格宽度", type: "number", step: "0.01" },
  { key: "threads", label: "线程数", type: "number", step: "1" },
  { key: "mip_focus", label: "MIP Focus", type: "select", options: ["1", "2", "3"] },
  { key: "cuts", label: "Cuts", type: "select", options: ["", "0", "1", "2"] },
  { key: "heuristics", label: "Heuristics", type: "number", step: "0.01" },
  { key: "hours", label: "时域覆盖(小时)", type: "number", step: "0.25", nullable: true },
  { key: "tight_temp_bounds", label: "使用紧温度边界", type: "checkbox" },
  { key: "build_only", label: "仅建模检查", type: "checkbox" },
  { key: "no_plots", label: "跳过图形输出", type: "checkbox" },
  { key: "strict_current_sos2", label: "严格电流SOS2", type: "checkbox" },
];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshSchemes")?.addEventListener("click", loadSchemes);
  document.getElementById("createSchemeForm")?.addEventListener("submit", createScheme);
  document.getElementById("uploadSchemeForm")?.addEventListener("submit", uploadScheme);
  document.getElementById("treeCreateScheme")?.addEventListener("click", createSchemeFromTree);
  document.getElementById("treeImportScheme")?.addEventListener("click", importSchemeFromTree);
  document.getElementById("treeEditScheme")?.addEventListener("click", editSelectedScheme);
  document.getElementById("treeCopyScheme")?.addEventListener("click", copyScheme);
  document.getElementById("treeDeleteScheme")?.addEventListener("click", deleteScheme);
  document.getElementById("schemeMetaForm")?.addEventListener("submit", submitSchemeMetaDialog);
  document.getElementById("cancelSchemeMeta")?.addEventListener("click", closeSchemeMetaDialog);
  document.getElementById("cancelSchemeMetaTop")?.addEventListener("click", closeSchemeMetaDialog);
  document.getElementById("schemeMetaModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "schemeMetaModal") closeSchemeMetaDialog();
  });
  document.getElementById("schemeSearch")?.addEventListener("input", (event) => {
    schemeState.search = event.target.value || "";
    renderSchemeList();
  });
  document.getElementById("schemeList")?.addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-scheme]")) return;
    event.preventDefault();
    schemeState.contextScheme = schemeState.current || "";
    showSchemeContextMenu(event.clientX, event.clientY);
  });
  document.addEventListener("click", hideSchemeContextMenu);
  document.addEventListener("click", hideSheetContextMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSchemeMetaDialog();
      hideSchemeContextMenu();
      hideSheetContextMenu();
    }
  });
  document.getElementById("saveSheet")?.addEventListener("click", saveSheet);
  document.getElementById("addSheetRow")?.addEventListener("click", addSheetRow);
  document.getElementById("deleteSheetRow")?.addEventListener("click", deleteSheetRow);
  document.getElementById("reloadSheet")?.addEventListener("click", reloadSheet);
  document.getElementById("sheetPrevPage")?.addEventListener("click", () => changeSheetPage(schemeState.sheetPage - 1));
  document.getElementById("sheetNextPage")?.addEventListener("click", () => changeSheetPage(schemeState.sheetPage + 1));
  document.getElementById("sheetPageSize")?.addEventListener("change", (event) => {
    schemeState.sheetPageSize = Number(event.target.value) || 200;
    schemeState.sheetPage = 1;
    loadSheet(schemeState.currentSheet, { preserveEdits: true }).catch(showError);
  });
  const sheetCurveChart = document.getElementById("sheetCurveChart");
  sheetCurveChart?.addEventListener("mousemove", onSheetCurveMouseMove);
  sheetCurveChart?.addEventListener("mouseleave", hideSheetCurveTip);
  sheetCurveChart?.addEventListener("pointerdown", startSheetCurveDrag);
  document.getElementById("reloadComputeConfig")?.addEventListener("click", () => loadComputeConfig(schemeState.current));
  document.getElementById("saveComputeConfig")?.addEventListener("click", saveComputeConfig);
  loadSchemes().catch(showError);
});

async function loadSchemes() {
  setError("schemeError", "");
  const payload = await api("/api/schemes");
  schemeState.schemes = payload.schemes || [];
  if (!schemeState.current && schemeState.schemes[0]) schemeState.current = schemeState.schemes[0].name;
  renderSchemeList();
  if (schemeState.current) await loadScheme(schemeState.current);
}

function renderSchemeList() {
  const target = document.getElementById("schemeList");
  if (!target) return;
  if (!schemeState.schemes.length) {
    target.innerHTML = `<div class="scheme-item"><strong>暂无方案</strong><span>请新建或导入 Excel 文件。</span></div>`;
    return;
  }
  const query = schemeState.search.trim().toLowerCase();
  const matches = (scheme) => !query || `${scheme.name} ${scheme.description || ""}`.toLowerCase().includes(query);
  const schemes = schemeState.schemes.filter(matches);
  target.innerHTML = schemes.length
    ? schemes.map(renderSchemeTreeItem).join("")
    : `<div class="scheme-empty">没有匹配的方案</div>`;
  target.querySelectorAll("[data-scheme-expand]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const name = button.dataset.schemeExpand || "";
      schemeState.expandedSchemes[name] = !(schemeState.expandedSchemes[name] ?? name === schemeState.current);
      renderSchemeList();
    });
  });
  target.querySelectorAll("[data-scheme]").forEach((button) => {
    button.addEventListener("click", async () => {
      const name = button.dataset.scheme || "";
      const sheet = button.dataset.schemeSheet || "";
      await loadScheme(name);
      if (sheet && schemeState.sheets.some((item) => item.name === sheet)) {
        await loadSheet(sheet);
        renderSchemeList();
      }
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      schemeState.contextScheme = button.dataset.scheme || "";
      if (schemeState.contextScheme && schemeState.contextScheme !== schemeState.current) {
        loadScheme(schemeState.contextScheme).catch(showError);
      }
      showSchemeContextMenu(event.clientX, event.clientY);
    });
  });
}

function renderSchemeTreeItem(scheme) {
  const expanded = Boolean(schemeState.expandedSchemes[scheme.name] ?? scheme.name === schemeState.current);
  const active = scheme.name === schemeState.current;
  return `
    <section class="scheme-tree-entry ${active ? "active" : ""}">
      <div class="scheme-tree-node ${expanded ? "expanded" : ""}">
        <button class="scheme-tree-toggle" type="button" data-scheme-expand="${escapeHtml(scheme.name)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起方案" : "展开方案"}">
          <span></span>
        </button>
        <button class="scheme-tree-folder ${active ? "active" : ""}" type="button" data-scheme="${escapeHtml(scheme.name)}" title="右键打开操作菜单">
          <span class="scheme-tree-icon folder" aria-hidden="true"></span>
          <strong>${escapeHtml(scheme.name)}</strong>
          <small>${escapeHtml(scheme.file_mtime || "")}</small>
        </button>
      </div>
      <div class="scheme-tree-children" ${expanded ? "" : "hidden"}>
        <button class="scheme-tree-file ${active && schemeState.currentSheet !== "计算参数" ? "active" : ""}" type="button" data-scheme="${escapeHtml(scheme.name)}" title="打开输入配置工作簿">
          <span class="scheme-tree-icon file" aria-hidden="true"></span>
          <strong>输入配置工作簿</strong>
          <span>${escapeHtml(scheme.description || "未填写说明")}</span>
        </button>
        <button class="scheme-tree-file ${active && schemeState.currentSheet === "计算参数" ? "active" : ""}" type="button" data-scheme="${escapeHtml(scheme.name)}" data-scheme-sheet="计算参数" title="打开计算参数表单">
          <span class="scheme-tree-icon file" aria-hidden="true"></span>
          <strong>计算参数</strong>
          <span>Excel 表单</span>
        </button>
      </div>
    </section>
  `;
}

function openSchemeMetaDialog(mode, scheme = {}) {
  const modal = document.getElementById("schemeMetaModal");
  const form = document.getElementById("schemeMetaForm");
  if (!modal || !form) return;
  const isEdit = mode === "edit";
  schemeState.schemeMetaDialog = {
    mode: isEdit ? "edit" : "create",
    source: isEdit ? scheme.name || schemeState.current || "" : "",
  };
  setError("schemeMetaError", "");
  document.getElementById("schemeMetaMode").textContent = isEdit ? "修改方案" : "新建方案";
  document.getElementById("schemeMetaTitle").textContent = isEdit ? "修改方案名称和说明" : "新建方案";
  document.getElementById("submitSchemeMeta").textContent = isEdit ? "保存修改" : "新建方案";
  form.elements.name.value = isEdit ? scheme.name || schemeState.current || "" : "";
  form.elements.description.value = isEdit ? scheme.description || "" : "";
  modal.hidden = false;
  window.setTimeout(() => form.elements.name.focus(), 0);
}

function closeSchemeMetaDialog() {
  const modal = document.getElementById("schemeMetaModal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("schemeMetaForm")?.reset();
  setError("schemeMetaError", "");
  schemeState.schemeMetaDialog = { mode: "", source: "" };
}

async function submitSchemeMetaDialog(event) {
  event.preventDefault();
  const form = event.target;
  const name = String(form.elements.name.value || "").trim();
  const description = String(form.elements.description.value || "").trim();
  if (!name) {
    setError("schemeMetaError", "请输入方案名称");
    form.elements.name.focus();
    return;
  }
  const dialog = schemeState.schemeMetaDialog || {};
  const submit = document.getElementById("submitSchemeMeta");
  if (submit) submit.disabled = true;
  try {
    const payload = dialog.mode === "edit"
      ? await api("/api/schemes/update", {
          method: "POST",
          body: JSON.stringify({ source: dialog.source || schemeState.current, name, description }),
        })
      : await api("/api/schemes", {
          method: "POST",
          body: JSON.stringify({ name, description }),
        });
    schemeState.current = payload.scheme.name;
    closeSchemeMetaDialog();
    await loadSchemes();
  } catch (error) {
    setError("schemeMetaError", error.message || "保存方案失败");
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function loadScheme(name) {
  if (!name) return;
  const switchingScheme = schemeState.current !== name;
  schemeState.current = name;
  if (switchingScheme) resetSheetRuntimeState();
  renderSchemeList();
  const payload = await api(`/api/scheme?name=${encodeURIComponent(name)}`);
  schemeState.sheets = payload.sheets || [];
  schemeState.currentSheet = schemeState.currentSheet && schemeState.sheets.some((s) => s.name === schemeState.currentSheet)
    ? schemeState.currentSheet
    : schemeState.sheets[0]?.name || "";
  document.getElementById("currentSchemeTitle").textContent = name;
  const treeEditScheme = document.getElementById("treeEditScheme");
  const treeCopyScheme = document.getElementById("treeCopyScheme");
  const treeDeleteScheme = document.getElementById("treeDeleteScheme");
  if (treeEditScheme) treeEditScheme.disabled = false;
  if (treeCopyScheme) treeCopyScheme.disabled = false;
  if (treeDeleteScheme) treeDeleteScheme.disabled = false;
  document.getElementById("reloadComputeConfig").disabled = false;
  document.getElementById("saveComputeConfig").disabled = false;
  renderSheetTabs();
  if (schemeState.currentSheet) await loadSheet(schemeState.currentSheet);
}

async function loadComputeConfig(name) {
  if (!name) return;
  const payload = await api(`/api/compute-config?scheme=${encodeURIComponent(name)}`);
  schemeState.computeConfig = payload.config || {};
  renderComputeConfig();
}

function renderComputeConfig() {
  const form = document.getElementById("computeConfigForm");
  if (!form) return;
  schemeState.computeConfigEditingKey = "";
  form.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>参数项</th>
          <th>参数值</th>
          <th>字段名</th>
        </tr>
      </thead>
      <tbody>
        ${computeConfigFields.map((field) => `
          <tr data-compute-row="${escapeHtml(field.key)}">
            <th>${escapeHtml(field.label)}</th>
            <td class="compute-config-value-cell" tabindex="0" role="button" data-compute-field="${escapeHtml(field.key)}" aria-label="${escapeHtml(field.label)}">
              ${renderComputeConfigValueDisplay(field, schemeState.computeConfig[field.key])}
            </td>
            <td><code>${escapeHtml(field.key)}</code></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  bindComputeConfigValueCells();
}

function bindComputeConfigValueCells() {
  document.querySelectorAll("[data-compute-field]").forEach((cell) => {
    cell.addEventListener("click", () => beginComputeConfigEdit(cell.dataset.computeField || ""));
    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== "F2") return;
      event.preventDefault();
      beginComputeConfigEdit(cell.dataset.computeField || "");
    });
  });
}

function computeConfigFieldByKey(key) {
  return computeConfigFields.find((field) => field.key === key) || null;
}

function renderComputeConfigValueDisplay(field, value) {
  if (field.type === "checkbox") {
    return `<span class="compute-config-display boolean ${value ? "enabled" : "disabled"}">${value ? "启用" : "关闭"}</span>`;
  }
  const text = value === null || value === undefined || value === ""
    ? (field.type === "select" && field.options.includes("") ? "默认" : "")
    : String(value);
  return `<span class="compute-config-display ${text ? "" : "empty"}">${escapeHtml(text)}</span>`;
}

function renderComputeConfigInput(field, value) {
  if (field.type === "checkbox") {
    return `
      <label class="table-check-row">
        <input data-compute-editor name="${escapeHtml(field.key)}" type="checkbox" ${value ? "checked" : ""}>
        <span>${value ? "启用" : "关闭"}</span>
      </label>
    `;
  }
  if (field.type === "select") {
    const options = field.options.map((option) => {
      const selected = String(value ?? "") === String(option) ? "selected" : "";
      const label = option === "" ? "默认" : option;
      return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(label)}</option>`;
    }).join("");
    return `<select data-compute-editor name="${escapeHtml(field.key)}" aria-label="${escapeHtml(field.label)}">${options}</select>`;
  }
  const text = value === null || value === undefined ? "" : value;
  return `<input data-compute-editor name="${escapeHtml(field.key)}" type="number" step="${escapeHtml(field.step || "1")}" value="${escapeHtml(text)}" ${field.nullable ? "" : "required"} aria-label="${escapeHtml(field.label)}">`;
}

function beginComputeConfigEdit(key) {
  const field = computeConfigFieldByKey(key);
  if (!field) return;
  if (schemeState.computeConfigEditingKey === key) return;
  commitComputeConfigEditor();
  const cell = document.querySelector(`[data-compute-field="${CSS.escape(key)}"]`);
  if (!cell) return;
  schemeState.computeConfigEditingKey = key;
  cell.classList.add("editing");
  cell.innerHTML = renderComputeConfigInput(field, schemeState.computeConfig[field.key]);
  const editor = cell.querySelector("[data-compute-editor]");
  if (!editor) return;
  editor.focus();
  if (editor.tagName === "INPUT" && editor.type === "number") editor.select?.();
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitComputeConfigEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelComputeConfigEdit();
    }
  });
  if (field.type === "select" || field.type === "checkbox") {
    editor.addEventListener("change", () => commitComputeConfigEditor());
  }
  editor.addEventListener("blur", () => window.setTimeout(() => commitComputeConfigEditor(), 0));
}

function readComputeConfigEditorValue(field, editor) {
  if (field.type === "checkbox") return Boolean(editor.checked);
  if (field.type === "number") {
    const raw = String(editor.value ?? "").trim();
    return raw === "" ? null : Number(raw);
  }
  const raw = String(editor.value ?? "");
  return raw === "" ? null : raw;
}

function normalizeComputeConfigValue(field, value) {
  if (field.type === "checkbox") return Boolean(value);
  if (field.type === "number") {
    if (value === "" || value === null || value === undefined) return null;
    return Number(value);
  }
  if (value === "" || value === null || value === undefined) return null;
  return String(value);
}

function commitComputeConfigEditor() {
  const key = schemeState.computeConfigEditingKey;
  if (!key) return;
  const field = computeConfigFieldByKey(key);
  const cell = document.querySelector(`[data-compute-field="${CSS.escape(key)}"]`);
  const editor = cell?.querySelector("[data-compute-editor]");
  if (field && editor) {
    schemeState.computeConfig[field.key] = readComputeConfigEditorValue(field, editor);
  }
  finishComputeConfigEdit(key);
}

function cancelComputeConfigEdit() {
  const key = schemeState.computeConfigEditingKey;
  if (!key) return;
  finishComputeConfigEdit(key);
}

function finishComputeConfigEdit(key) {
  const field = computeConfigFieldByKey(key);
  const cell = document.querySelector(`[data-compute-field="${CSS.escape(key)}"]`);
  schemeState.computeConfigEditingKey = "";
  if (!field || !cell) return;
  cell.classList.remove("editing");
  cell.innerHTML = renderComputeConfigValueDisplay(field, schemeState.computeConfig[field.key]);
}

function readComputeConfigForm() {
  commitComputeConfigEditor();
  const cfg = {};
  for (const field of computeConfigFields) {
    cfg[field.key] = normalizeComputeConfigValue(field, schemeState.computeConfig[field.key]);
  }
  return cfg;
}

async function saveComputeConfig() {
  if (!schemeState.current) return;
  try {
    const payload = await api("/api/compute-config", {
      method: "POST",
      body: JSON.stringify({ scheme: schemeState.current, config: readComputeConfigForm() }),
    });
    schemeState.computeConfig = payload.config || {};
    renderComputeConfig();
    document.getElementById("computeConfigHint").textContent = `已保存到 Excel 表单“计算参数”：${new Date().toLocaleTimeString("zh-CN")}`;
    await loadScheme(schemeState.current);
    schemeState.currentSheet = "计算参数";
    renderSheetTabs();
    await loadSheet("计算参数");
  } catch (error) {
    showError(error);
  }
}

function renderSheetTabs() {
  const target = document.getElementById("sheetTabs");
  target.innerHTML = schemeState.sheets.map((sheet) => `
    <button type="button" class="${sheet.name === schemeState.currentSheet ? "active" : ""}" data-sheet="${escapeHtml(sheet.name)}">${escapeHtml(sheet.name)}</button>
  `).join("");
  target.querySelectorAll("[data-sheet]").forEach((button) => button.addEventListener("click", () => loadSheet(button.dataset.sheet || "")));
}

function resetSheetRuntimeState() {
  schemeState.rows = [];
  schemeState.sheetMeta = {};
  schemeState.sheetPage = 1;
  schemeState.selectedRowIndex = 0;
  schemeState.selectedExcelRow = 0;
  schemeState.pendingCellUpdates = {};
  schemeState.visibleCurves = {};
  schemeState.selectedCurveKey = "";
  schemeState.sheetCurveMeta = null;
  schemeState.sheetCurveDrag = null;
  schemeState.windCurveRows = [];
  schemeState.dieselCurveRows = [];
}

function setWorkbookSheetViewsHidden(hidden) {
  document.getElementById("sheetTable").hidden = hidden;
  document.getElementById("sheetCurvePanel").hidden = hidden;
  document.getElementById("sheetPager").hidden = hidden;
  document.getElementById("sheetToolbar").hidden = hidden;
  if (hidden) setCurveBelowTableLayout(false);
}

async function loadSheet(sheet, options = {}) {
  const switchingSheet = schemeState.currentSheet !== sheet;
  schemeState.currentSheet = sheet;
  if (switchingSheet && !options.preserveEdits) {
    schemeState.sheetPage = 1;
    schemeState.pendingCellUpdates = {};
    schemeState.visibleCurves = {};
    schemeState.selectedCurveKey = "";
  }
  renderSheetTabs();
  if (sheet === "计算参数") {
    await loadComputeConfig(schemeState.current);
    document.getElementById("computeConfigView").hidden = false;
    setWorkbookSheetViewsHidden(true);
    document.getElementById("reloadSheet").disabled = true;
    document.getElementById("saveSheet").disabled = true;
    return;
  }
  document.getElementById("computeConfigView").hidden = true;
  setWorkbookSheetViewsHidden(false);
  const page = Math.max(1, Number(options.page || schemeState.sheetPage || 1));
  const pageSize = Math.max(1, Number(schemeState.sheetPageSize || 200));
  const payload = await api(`/api/sheet?scheme=${encodeURIComponent(schemeState.current)}&sheet=${encodeURIComponent(sheet)}&page=${page}&page_size=${pageSize}`);
  schemeState.rows = payload.rows || [];
  schemeState.sheetMeta = payload;
  schemeState.sheetPage = Number(payload.page || page);
  schemeState.sheetPageSize = Number(payload.page_size || pageSize);
  applyPendingUpdatesToLoadedRows();
  await loadSpecialCurveRows(payload);
  const firstRow = sheetPageRows()[0];
  schemeState.selectedRowIndex = firstRow?.index || 0;
  schemeState.selectedExcelRow = firstRow?.excelRow || 0;
  document.getElementById("saveSheet").disabled = false;
  document.getElementById("reloadSheet").disabled = false;
  document.getElementById("saveHint").textContent = pendingUpdateCount()
    ? `有 ${pendingUpdateCount()} 个单元格未保存。`
    : "分页显示完整工作表，保存时仅提交已编辑的单元格。";
  renderSheetPager();
  renderSheetCurvePanel();
  renderSheetTable();
}

function applyPendingUpdatesToLoadedRows() {
  Object.values(schemeState.pendingCellUpdates || {}).forEach((item) => {
    const localIndex = localRowIndexFromExcelRow(Number(item.row));
    const colIndex = Number(item.col) - 1;
    if (localIndex < 0 || colIndex < 0) return;
    if (!schemeState.rows[localIndex]) schemeState.rows[localIndex] = [];
    schemeState.rows[localIndex][colIndex] = item.value;
  });
}

function sheetPageRows() {
  return bodyRowsFromSheetPayload(schemeState.sheetMeta, schemeState.rows);
}

function bodyRowsFromSheetPayload(payload, rows, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const bodyStart = Number(payload?.body_start_row || 0);
  if (!bodyStart) return [];
  return sourceRows.slice(1).map((row, offset) => {
    const excelRow = bodyStart + offset;
    return {
      row,
      index: options.globalIndex ? Math.max(1, excelRow - 1) : offset + 1,
      excelRow,
    };
  });
}

async function loadFullSheetBodyRows(initialPayload, expectedSheet) {
  const scheme = schemeState.current;
  const sheet = schemeState.currentSheet;
  const firstPageRows = bodyRowsFromSheetPayload(initialPayload, initialPayload?.rows || schemeState.rows, { globalIndex: true });
  const totalRows = Number(initialPayload?.total_rows || firstPageRows.length || 0);
  if (!scheme || sheet !== expectedSheet || totalRows <= firstPageRows.length) return firstPageRows;
  const pageSize = 2000;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const allRows = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const payload = await api(`/api/sheet?scheme=${encodeURIComponent(scheme)}&sheet=${encodeURIComponent(sheet)}&page=${page}&page_size=${pageSize}`);
    if (schemeState.current !== scheme || schemeState.currentSheet !== sheet) return;
    allRows.push(...bodyRowsFromSheetPayload(payload, payload.rows || [], { globalIndex: true }));
  }
  return allRows;
}

async function loadWindCurveRows(initialPayload) {
  schemeState.windCurveRows = await loadFullSheetBodyRows(initialPayload, WIND_TURBINE_SHEET_NAME) || [];
}

async function loadDieselCurveRows(initialPayload) {
  schemeState.dieselCurveRows = await loadFullSheetBodyRows(initialPayload, DIESEL_GENERATOR_SHEET_NAME) || [];
}

async function loadSpecialCurveRows(initialPayload) {
  if (schemeState.currentSheet === WIND_TURBINE_SHEET_NAME) {
    await loadWindCurveRows(initialPayload);
    schemeState.dieselCurveRows = [];
    return;
  }
  if (schemeState.currentSheet === DIESEL_GENERATOR_SHEET_NAME) {
    await loadDieselCurveRows(initialPayload);
    schemeState.windCurveRows = [];
    return;
  }
  schemeState.windCurveRows = [];
  schemeState.dieselCurveRows = [];
}

function rowsWithPendingCellUpdates(rows) {
  const pending = Object.values(schemeState.pendingCellUpdates || {});
  if (!pending.length) return rows;
  return rows.map((item) => {
    const row = Array.isArray(item.row) ? [...item.row] : [];
    pending.forEach((update) => {
      if (Number(update.row) !== Number(item.excelRow)) return;
      const colIndex = Number(update.col) - 1;
      if (colIndex >= 0) row[colIndex] = update.value;
    });
    return { ...item, row };
  });
}

function localRowIndexFromExcelRow(excelRow) {
  if (excelRow === 1) return 0;
  const bodyStart = Number(schemeState.sheetMeta.body_start_row || 0);
  if (!bodyStart || excelRow < bodyStart) return -1;
  const index = excelRow - bodyStart + 1;
  return index >= 1 && index < schemeState.rows.length ? index : -1;
}

function renderSheetPager() {
  const pager = document.getElementById("sheetPager");
  if (!pager || schemeState.currentSheet === "计算参数") return;
  const meta = schemeState.sheetMeta || {};
  const page = Number(meta.page || schemeState.sheetPage || 1);
  const totalPages = Number(meta.total_pages || 1);
  const totalRows = Number(meta.total_rows || 0);
  const start = Number(meta.body_start_row || 0);
  const end = Number(meta.body_end_row || 0);
  pager.hidden = false;
  document.getElementById("sheetPrevPage").disabled = page <= 1;
  document.getElementById("sheetNextPage").disabled = page >= totalPages;
  document.getElementById("sheetPageSize").value = String(schemeState.sheetPageSize);
  document.getElementById("sheetPageInfo").textContent = totalRows
    ? `第 ${page}/${totalPages} 页，Excel 行 ${start}-${end}，正文共 ${totalRows} 行`
    : "当前工作表无正文数据";
}

async function changeSheetPage(page) {
  if (!schemeState.currentSheet || schemeState.currentSheet === "计算参数") return;
  readVisibleCellsToState();
  const totalPages = Number(schemeState.sheetMeta.total_pages || 1);
  const target = Math.min(Math.max(1, page), totalPages);
  if (target === schemeState.sheetPage) return;
  schemeState.sheetPage = target;
  await loadSheet(schemeState.currentSheet, { preserveEdits: true });
}

async function reloadSheet() {
  if (!schemeState.currentSheet || schemeState.currentSheet === "计算参数") return;
  if (pendingUpdateCount() && !confirm("当前有未保存的单元格修改，刷新会丢弃这些临时修改。确认刷新？")) return;
  schemeState.pendingCellUpdates = {};
  try {
    setError("schemeError", "");
    await loadSheet(schemeState.currentSheet, { preserveEdits: true });
    document.getElementById("saveHint").textContent = `已刷新当前页：${new Date().toLocaleTimeString("zh-CN")}`;
  } catch (error) {
    showError(error);
  }
}

function renderSheetTable() {
  const target = document.getElementById("sheetTable");
  if (!schemeState.rows.length) {
    target.innerHTML = `<div class="scheme-item">当前工作表为空。</div>`;
    return;
  }
  const colCount = sheetColumnCount();
  const headers = Array.from({ length: colCount }, (_, c) => String(schemeState.rows[0]?.[c] ?? "").trim() || columnName(c + 1));
  const bodyRows = sheetPageRows();
  if (!bodyRows.length) {
    target.innerHTML = `<div class="scheme-item">当前工作表无正文数据。</div>`;
    return;
  }
  target.innerHTML = `
    <table class="sheet-preview-table">
      <thead>
        <tr>
          ${headers.map((header) => `<th><span>${escapeHtml(header)}</span></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${bodyRows.map(({ row, index, excelRow }) => `
          <tr class="${excelRow === schemeState.selectedExcelRow ? "selected" : ""}" data-row="${index}" data-excel-row="${excelRow}">
            ${headers.map((_, c) => `<td contenteditable="true" data-r="${excelRow}" data-c="${c + 1}">${escapeHtml(row[c] ?? "")}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  target.querySelectorAll("tbody tr[data-row]").forEach((row) => {
    const selectRow = () => {
      schemeState.selectedRowIndex = Number(row.dataset.row || 0);
      schemeState.selectedExcelRow = Number(row.dataset.excelRow || 0);
      target.querySelectorAll("tbody tr.selected").forEach((item) => item.classList.remove("selected"));
      row.classList.add("selected");
    };
    row.addEventListener("click", selectRow);
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      selectRow();
      showSheetContextMenu(event.clientX, event.clientY);
    });
  });
  target.querySelectorAll("td[data-r][data-c]").forEach((cell) => {
    cell.addEventListener("focus", () => {
      const row = cell.closest("tr[data-row]");
      if (!row) return;
      schemeState.selectedRowIndex = Number(row.dataset.row || 0);
      schemeState.selectedExcelRow = Number(row.dataset.excelRow || 0);
      target.querySelectorAll("tbody tr.selected").forEach((item) => item.classList.remove("selected"));
      row.classList.add("selected");
    });
    cell.addEventListener("input", () => {
      const value = parseCellValue(cell.textContent || "");
      setSheetCellValue(Number(cell.dataset.r), Number(cell.dataset.c), value, { fromTable: true, render: false });
      scheduleRenderSheetCurveChart();
    });
  });
}

function pendingUpdateCount() {
  return Object.keys(schemeState.pendingCellUpdates || {}).length;
}

function markCellUpdate(excelRow, excelCol, value) {
  if (!Number.isFinite(excelRow) || !Number.isFinite(excelCol) || excelRow < 1 || excelCol < 1) return;
  schemeState.pendingCellUpdates[`${excelRow}:${excelCol}`] = { row: excelRow, col: excelCol, value };
  const hint = document.getElementById("saveHint");
  if (hint) hint.textContent = `有 ${pendingUpdateCount()} 个单元格未保存。`;
}

function setSheetCellValue(excelRow, excelCol, value, options = {}) {
  if (!Number.isFinite(excelRow) || !Number.isFinite(excelCol)) return false;
  const localIndex = localRowIndexFromExcelRow(excelRow);
  const colIndex = excelCol - 1;
  if (localIndex < 0 || colIndex < 0) return false;
  if (!schemeState.rows[localIndex]) schemeState.rows[localIndex] = [];
  schemeState.rows[localIndex][colIndex] = value;
  markCellUpdate(excelRow, excelCol, value);
  if (!options.fromTable) {
    const cell = document.querySelector(`#sheetTable td[data-r="${excelRow}"][data-c="${excelCol}"]`);
    if (cell) cell.textContent = formatCellText(value);
  }
  if (options.render !== false) {
    renderSheetCurvePanel();
  }
  return true;
}

function formatCellText(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function scheduleRenderSheetCurveChart() {
  if (sheetsWithoutCurves.has(schemeState.currentSheet)) return;
  if (schemeState.sheetCurveRenderFrame) return;
  schemeState.sheetCurveRenderFrame = window.requestAnimationFrame(() => {
    schemeState.sheetCurveRenderFrame = 0;
    renderSheetCurvePanel();
  });
}

function sheetHeaders() {
  const colCount = sheetColumnCount();
  return Array.from({ length: colCount }, (_, c) => String(schemeState.rows[0]?.[c] ?? "").trim() || columnName(c + 1));
}

function collectSheetCurveSeries() {
  if (schemeState.currentSheet === WIND_TURBINE_SHEET_NAME) return collectWindPowerCurveSeries();
  if (schemeState.currentSheet === DIESEL_GENERATOR_SHEET_NAME) return collectDieselFuelCurveSeries();
  const headers = sheetHeaders();
  const rows = sheetPageRows();
  const colCount = headers.length;
  const firstDataCol = colCount > 1 ? 1 : 0;
  const series = [];
  for (let c = firstDataCol; c < colCount; c += 1) {
    const points = [];
    rows.forEach(({ row, index, excelRow }, offset) => {
      const value = Number(row[c]);
      if (!Number.isFinite(value)) return;
      points.push({
        rowIndex: index,
        xIndex: offset,
        excelRow,
        col: c + 1,
        value,
        label: String(row[0] ?? excelRow),
      });
    });
    if (points.length < 2 && rows.length > 2) continue;
    if (!points.length) continue;
    const key = String(c + 1);
    if (!(key in schemeState.visibleCurves)) schemeState.visibleCurves[key] = true;
    series.push({
      key,
      col: c + 1,
      title: headers[c],
      color: sheetCurveColors[series.length % sheetCurveColors.length],
      points,
    });
  }
  if (!series.some((item) => item.key === schemeState.selectedCurveKey)) {
    schemeState.selectedCurveKey = series.find((item) => schemeState.visibleCurves[item.key])?.key || series[0]?.key || "";
  }
  return { headers, rows, series, xTitle: headers[0] || "序号", yTitle: "数值", editable: true, numericX: false };
}

function findHeaderIndex(headers, matchers) {
  return headers.findIndex((header) => matchers.every((matcher) => String(header || "").includes(matcher)));
}

function findFirstHeaderIndex(headers, matcherGroups) {
  for (const matchers of matcherGroups) {
    const index = findHeaderIndex(headers, matchers);
    if (index >= 0) return index;
  }
  return -1;
}

function collectWindPowerCurveSeries() {
  const headers = sheetHeaders();
  const sourceRows = schemeState.windCurveRows.length ? schemeState.windCurveRows : sheetPageRows();
  const rows = rowsWithPendingCellUpdates(sourceRows);
  const ratedPowerCol = findHeaderIndex(headers, ["额定功率"]);
  const cutInCol = findHeaderIndex(headers, ["切入", "风速"]);
  const ratedSpeedCol = findHeaderIndex(headers, ["额定风速"]);
  const cutOutCol = findHeaderIndex(headers, ["切出", "风速"]);
  const invalid = [ratedPowerCol, cutInCol, ratedSpeedCol, cutOutCol].some((index) => index < 0);
  if (invalid) {
    return { headers, rows: [], series: [], xTitle: "风速(m/s)", yTitle: "功率(kW)", editable: false, numericX: true };
  }
  const units = rows
    .map(({ row, index, excelRow }, offset) => {
      const ratedPower = Number(row[ratedPowerCol]);
      const cutIn = Number(row[cutInCol]);
      const ratedSpeed = Number(row[ratedSpeedCol]);
      const cutOut = Number(row[cutOutCol]);
      if (![ratedPower, cutIn, ratedSpeed, cutOut].every(Number.isFinite)) return null;
      if (ratedPower <= 0 || cutIn < 0 || ratedSpeed <= cutIn || cutOut <= ratedSpeed) return null;
      const name = String(row[0] ?? offset + 1).trim() || String(offset + 1);
      return { row, index, excelRow, offset, name, ratedPower, cutIn, ratedSpeed, cutOut };
    })
    .filter(Boolean);
  if (!units.length) {
    return { headers, rows: [], series: [], xTitle: "风速(m/s)", yTitle: "功率(kW)", editable: false, numericX: true };
  }
  const maxCutOut = Math.max(...units.map((unit) => unit.cutOut));
  const maxSpeed = Math.max(1, maxCutOut);
  const baseSamples = Array.from({ length: 121 }, (_, index) => (maxSpeed * index) / 120);
  const criticalSamples = units.flatMap((unit) => [0, unit.cutIn, unit.ratedSpeed, unit.cutOut]);
  const speedSamples = Array.from(new Set([...baseSamples, ...criticalSamples].map((speed) => Math.round(speed * 1000) / 1000)))
    .filter((speed) => speed >= 0 && speed <= maxSpeed)
    .sort((a, b) => a - b);
  const curveRows = speedSamples.map((speed, index) => ({ row: [speed], index, excelRow: index + 1, speed }));
  const series = units.map((unit, index) => {
    const key = `wind:${unit.excelRow}`;
    if (!(key in schemeState.visibleCurves)) schemeState.visibleCurves[key] = true;
    return {
      key,
      col: 0,
      title: `机组${unit.name} ${fmt(unit.ratedPower)}kW`,
      color: sheetCurveColors[index % sheetCurveColors.length],
      editable: false,
      unit,
      points: speedSamples.map((speed, sampleIndex) => ({
        rowIndex: sampleIndex,
        xIndex: sampleIndex,
        xValue: speed,
        excelRow: unit.excelRow,
        col: 0,
        value: windPowerAtSpeed(speed, unit),
        label: `${fmt(speed)} m/s`,
      })),
    };
  });
  if (!series.some((item) => item.key === schemeState.selectedCurveKey)) {
    schemeState.selectedCurveKey = series.find((item) => schemeState.visibleCurves[item.key])?.key || series[0]?.key || "";
  }
  return {
    headers,
    rows: curveRows,
    sourceRows: rows,
    series,
    xTitle: "风速(m/s)",
    yTitle: "功率(kW)",
    editable: false,
    numericX: true,
    xMin: 0,
    xMax: maxSpeed,
    yMin: 0,
    yMax: Math.max(...units.map((unit) => unit.ratedPower)),
  };
}

function windPowerAtSpeed(speed, unit) {
  const v = Number(speed);
  const ratedPower = Number(unit.ratedPower);
  const cutIn = Number(unit.cutIn);
  const ratedSpeed = Number(unit.ratedSpeed);
  const cutOut = Number(unit.cutOut);
  if (![v, ratedPower, cutIn, ratedSpeed, cutOut].every(Number.isFinite)) return 0;
  if (v < cutIn || v >= cutOut) return 0;
  if (v >= ratedSpeed) return ratedPower;
  const denominator = Math.pow(ratedSpeed, 3) - Math.pow(cutIn, 3);
  const ratio = denominator > 0 ? (Math.pow(v, 3) - Math.pow(cutIn, 3)) / denominator : (v - cutIn) / Math.max(1e-9, ratedSpeed - cutIn);
  return Math.max(0, Math.min(ratedPower, ratedPower * ratio));
}

function collectDieselFuelCurveSeries() {
  const headers = sheetHeaders();
  const sourceRows = schemeState.dieselCurveRows.length ? schemeState.dieselCurveRows : sheetPageRows();
  const rows = rowsWithPendingCellUpdates(sourceRows);
  const ratedPowerCol = findFirstHeaderIndex(headers, [["额定功率"], ["额定容量"], ["额定", "功率"], ["额定", "容量"]]);
  const pointCountCol = findHeaderIndex(headers, ["工况点", "数量"]);
  const maxIndexedPoint = Math.max(
    0,
    ...headers.map((header) => {
      const powerMatch = String(header || "").match(/^功率\s*(\d+)/);
      const fuelMatch = String(header || "").match(/^油耗率\s*(\d+)/);
      return Number(powerMatch?.[1] || fuelMatch?.[1] || 0);
    }),
  );
  const pointColumns = Array.from({ length: maxIndexedPoint }, (_, index) => {
    const pointNo = index + 1;
    return {
      pointNo,
      powerCol: findHeaderIndex(headers, [`功率${pointNo}`]),
      fuelCol: findHeaderIndex(headers, [`油耗率${pointNo}`]),
    };
  }).filter((item) => item.powerCol >= 0 && item.fuelCol >= 0);
  if (ratedPowerCol < 0 || pointCountCol < 0 || !pointColumns.length) {
    return { headers, rows: [], series: [], xTitle: "功率(kW)", yTitle: "油耗率(kg/kWh)", editable: false, numericX: true };
  }
  const units = rows
    .map(({ row, index, excelRow }, offset) => {
      const ratedPower = Number(row[ratedPowerCol]);
      const pointCountRaw = Number(row[pointCountCol]);
      const pointCount = Number.isFinite(pointCountRaw) && pointCountRaw > 0
        ? Math.min(Math.floor(pointCountRaw), pointColumns.length)
        : pointColumns.length;
      const points = pointColumns.slice(0, pointCount)
        .map((item) => ({
          pointNo: item.pointNo,
          power: Number(row[item.powerCol]),
          fuelRate: Number(row[item.fuelCol]),
        }))
        .filter((point) => Number.isFinite(point.power) && Number.isFinite(point.fuelRate))
        .sort((a, b) => a.power - b.power);
      if (!points.length) return null;
      const name = String(row[0] ?? offset + 1).trim() || String(offset + 1);
      return { row, index, excelRow, offset, name, ratedPower, pointCount, points };
    })
    .filter(Boolean);
  if (!units.length) {
    return { headers, rows: [], series: [], xTitle: "功率(kW)", yTitle: "油耗率(kg/kWh)", editable: false, numericX: true };
  }
  const allPowers = units.flatMap((unit) => unit.points.map((point) => point.power));
  const allFuelRates = units.flatMap((unit) => unit.points.map((point) => point.fuelRate));
  const maxPower = Math.max(...allPowers, ...units.map((unit) => Number(unit.ratedPower)).filter(Number.isFinite), 1);
  const minFuelRate = Math.min(...allFuelRates);
  const maxFuelRate = Math.max(...allFuelRates);
  const curveRows = Array.from(new Set(allPowers.map((power) => Math.round(power * 1000) / 1000)))
    .sort((a, b) => a - b)
    .map((power, index) => ({ row: [power], index, excelRow: index + 1, power }));
  const series = units.map((unit, index) => {
    const key = `diesel:${unit.excelRow}`;
    if (!(key in schemeState.visibleCurves)) schemeState.visibleCurves[key] = true;
    return {
      key,
      col: 0,
      title: `机组${unit.name} ${Number.isFinite(unit.ratedPower) ? `${fmt(unit.ratedPower)}kW ` : ""}${unit.points.length}点`,
      color: sheetCurveColors[index % sheetCurveColors.length],
      editable: false,
      points: unit.points.map((point, pointIndex) => ({
        rowIndex: pointIndex,
        xIndex: pointIndex,
        xValue: point.power,
        excelRow: unit.excelRow,
        col: 0,
        value: point.fuelRate,
        label: `${fmt(point.power)} kW`,
        pointNo: point.pointNo,
      })),
    };
  });
  if (!series.some((item) => item.key === schemeState.selectedCurveKey)) {
    schemeState.selectedCurveKey = series.find((item) => schemeState.visibleCurves[item.key])?.key || series[0]?.key || "";
  }
  const fuelSpan = maxFuelRate - minFuelRate;
  return {
    headers,
    rows: curveRows,
    sourceRows: rows,
    series,
    xTitle: "功率(kW)",
    yTitle: "油耗率(kg/kWh)",
    editable: false,
    numericX: true,
    xMin: 0,
    xMax: maxPower,
    yMin: fuelSpan > 0 ? minFuelRate - fuelSpan * 0.1 : minFuelRate - 0.01,
    yMax: fuelSpan > 0 ? maxFuelRate + fuelSpan * 0.1 : maxFuelRate + 0.01,
  };
}

function sheetCurveTitleForCurrentSheet() {
  if (schemeState.currentSheet === WIND_TURBINE_SHEET_NAME) return "风电机组：风速-功率曲线";
  if (schemeState.currentSheet === DIESEL_GENERATOR_SHEET_NAME) return "柴油发电机：功率-油耗率曲线";
  return `${schemeState.currentSheet || "工作表"}：第 ${schemeState.sheetPage || 1} 页曲线`;
}

function placeSheetCurvePanelForCurrentSheet(panel) {
  const sheetTable = document.getElementById("sheetTable");
  const sheetPager = document.getElementById("sheetPager");
  if (!panel?.parentNode || !sheetTable || !sheetPager) return;
  if (curveBelowTableSheets.has(schemeState.currentSheet)) {
    sheetTable.parentNode.insertBefore(panel, sheetTable.nextSibling);
  } else {
    sheetPager.parentNode.insertBefore(panel, sheetPager);
  }
}

function setCurveBelowTableLayout(enabled) {
  document.querySelector(".main-panel")?.classList.toggle("curve-below-table-layout", Boolean(enabled));
}

function renderSheetCurvePanel() {
  const panel = document.getElementById("sheetCurvePanel");
  const buttons = document.getElementById("sheetCurveButtons");
  const title = document.getElementById("sheetCurveTitle");
  if (!panel || !buttons || !title) return;
  placeSheetCurvePanelForCurrentSheet(panel);
  setCurveBelowTableLayout(curveBelowTableSheets.has(schemeState.currentSheet) && !sheetsWithoutCurves.has(schemeState.currentSheet));
  panel.classList.toggle("wind-power-curve-panel", schemeState.currentSheet === WIND_TURBINE_SHEET_NAME);
  panel.classList.toggle("diesel-fuel-curve-panel", schemeState.currentSheet === DIESEL_GENERATOR_SHEET_NAME);
  if (sheetsWithoutCurves.has(schemeState.currentSheet)) {
    setCurveBelowTableLayout(false);
    panel.hidden = true;
    buttons.innerHTML = "";
    const chart = document.getElementById("sheetCurveChart");
    if (chart) chart.innerHTML = "";
    hideSheetCurveTip();
    schemeState.sheetCurveMeta = null;
    return;
  }
  panel.hidden = false;
  const data = collectSheetCurveSeries();
  title.textContent = sheetCurveTitleForCurrentSheet();
  if (!data.series.length) {
    buttons.innerHTML = `<span class="sheet-meta">当前页没有可绘制的数值列。</span>`;
    renderSheetCurveChart(data);
    return;
  }
  buttons.innerHTML = data.series.map((series) => {
    const visible = schemeState.visibleCurves[series.key] !== false;
    const selected = series.key === schemeState.selectedCurveKey;
    return `
      <button type="button" class="sheet-curve-legend ${selected ? "selected" : ""} ${visible ? "" : "hidden-curve"}" data-sheet-curve-toggle="${escapeHtml(series.key)}" aria-pressed="${visible}" title="${escapeHtml(series.title)}">
        <span class="sheet-curve-swatch" style="background:${escapeHtml(series.color)}"></span>
        <span>${escapeHtml(series.title)}</span>
      </button>
    `;
  }).join("");
  buttons.querySelectorAll("[data-sheet-curve-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sheetCurveToggle || "";
      const nextVisible = !(schemeState.visibleCurves[key] !== false);
      schemeState.visibleCurves[key] = nextVisible;
      if (nextVisible) {
        schemeState.selectedCurveKey = key;
      } else if (schemeState.selectedCurveKey === key) {
        const next = data.series.find((item) => item.key !== key && schemeState.visibleCurves[item.key] !== false);
        schemeState.selectedCurveKey = next?.key || "";
      }
      renderSheetCurvePanel();
    });
  });
  renderSheetCurveChart(data);
}

function renderSheetCurveChart(data = null) {
  const svg = document.getElementById("sheetCurveChart");
  if (!svg) return;
  const curveData = data || collectSheetCurveSeries();
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 280;
  const padLeft = 68;
  const padRight = 26;
  const padTop = 30;
  const padBottom = 44;
  const plotWidth = Math.max(1, width - padLeft - padRight);
  const plotHeight = Math.max(1, height - padTop - padBottom);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const visibleSeries = curveData.series.filter((series) => schemeState.visibleCurves[series.key] !== false);
  const selectedSeries = visibleSeries.find((series) => series.key === schemeState.selectedCurveKey) || visibleSeries[0] || null;
  if (selectedSeries && selectedSeries.key !== schemeState.selectedCurveKey) schemeState.selectedCurveKey = selectedSeries.key;
  const values = visibleSeries.flatMap((series) => series.points.map((point) => point.value));
  if (!curveData.series.length || !visibleSeries.length || !values.length || !curveData.rows.length) {
    svg.innerHTML = `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#95aeb7" font-size="14">${curveData.series.length ? "当前没有显示的曲线" : "当前页没有可绘制的数值列"}</text>`;
    schemeState.sheetCurveMeta = null;
    return;
  }
  const numericX = Boolean(curveData.numericX);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const configuredMin = Number(curveData.yMin);
  const configuredMax = Number(curveData.yMax);
  const minValue = Number.isFinite(configuredMin) ? configuredMin : (rawMin === rawMax ? rawMin - 1 : rawMin);
  const maxValue = Number.isFinite(configuredMax) ? configuredMax : (rawMin === rawMax ? rawMax + 1 : rawMax);
  const valueSpan = maxValue - minValue || 1;
  const allXValues = visibleSeries.flatMap((series) => series.points.map((point) => Number(point.xValue)).filter(Number.isFinite));
  const xMin = numericX ? (Number.isFinite(Number(curveData.xMin)) ? Number(curveData.xMin) : Math.min(...allXValues)) : 0;
  const xMax = numericX ? (Number.isFinite(Number(curveData.xMax)) ? Number(curveData.xMax) : Math.max(...allXValues)) : Math.max(0, curveData.rows.length - 1);
  const xSpan = Math.max(1e-9, xMax - xMin);
  const x = (pointOrIndex) => {
    if (numericX) {
      const xValue = typeof pointOrIndex === "object" ? Number(pointOrIndex.xValue) : Number(pointOrIndex);
      return padLeft + ((xValue - xMin) / xSpan) * plotWidth;
    }
    const index = typeof pointOrIndex === "object" ? Number(pointOrIndex.xIndex) : Number(pointOrIndex);
    return padLeft + (index / Math.max(1, curveData.rows.length - 1)) * plotWidth;
  };
  const y = (value) => padTop + plotHeight - ((value - minValue) / valueSpan) * plotHeight;
  const yTicks = [0, 1, 2, 3, 4].map((index) => minValue + (valueSpan * index) / 4);
  const yGrid = yTicks.map((value) => {
    const tickY = y(value);
    return `<line x1="${padLeft}" x2="${width - padRight}" y1="${tickY.toFixed(1)}" y2="${tickY.toFixed(1)}" stroke="rgba(139,182,194,.22)"/><text x="${padLeft - 8}" y="${(tickY + 4).toFixed(1)}" text-anchor="end" fill="#95aeb7" font-size="11">${escapeHtml(fmt(value))}</text>`;
  }).join("");
  const xTickCount = Math.min(6, Math.max(2, curveData.rows.length));
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const ratio = index / Math.max(1, xTickCount - 1);
    const rowIndex = Math.min(Math.round(ratio * Math.max(0, curveData.rows.length - 1)), curveData.rows.length - 1);
    const row = curveData.rows[rowIndex];
    const label = numericX ? `${fmt(xMin + ratio * xSpan)}` : String(row?.row?.[0] ?? row?.excelRow ?? rowIndex + 1);
    const tickX = numericX ? x(xMin + ratio * xSpan) : x(rowIndex);
    return `<line x1="${tickX.toFixed(1)}" x2="${tickX.toFixed(1)}" y1="${padTop + plotHeight}" y2="${padTop + plotHeight + 5}" stroke="rgba(139,182,194,.45)"/><text x="${tickX.toFixed(1)}" y="${height - 14}" text-anchor="middle" fill="#95aeb7" font-size="11">${escapeHtml(shortAxisLabel(label))}</text>`;
  }).join("");
  const paths = visibleSeries.map((series) => {
    const d = series.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const selected = series.key === selectedSeries?.key;
    return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="${selected ? 2.6 : 1.8}" opacity="${selected ? "1" : ".72"}" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const pointMarks = visibleSeries.map((series) => {
    const selected = series.key === selectedSeries?.key;
    if (!selected && series.points.length > 260) return "";
    return series.points.map((point) => `
      <circle class="curve-point" data-curve-key="${escapeHtml(series.key)}" data-row="${point.excelRow}" data-col="${point.col}" cx="${x(point).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${selected ? 3.5 : 2.2}" fill="${series.color}" opacity="${selected ? "1" : ".62"}"/>
    `).join("");
  }).join("");
  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
    <g>${yGrid}</g>
    <line x1="${padLeft}" x2="${width - padRight}" y1="${padTop + plotHeight}" y2="${padTop + plotHeight}" stroke="rgba(149,174,183,.75)"/>
    <line x1="${padLeft}" x2="${padLeft}" y1="${padTop}" y2="${padTop + plotHeight}" stroke="rgba(149,174,183,.75)"/>
    <g>${xTicks}</g>
    <g>${paths}</g>
    <g>${pointMarks}</g>
    <text x="${padLeft}" y="20" fill="#edf8fb" font-size="12" font-weight="700">${escapeHtml(selectedSeries?.title || "曲线")}</text>
    <text x="${width - padRight}" y="20" text-anchor="end" fill="#95aeb7" font-size="11">${escapeHtml(`${curveData.xTitle || ""} / ${curveData.yTitle || ""}`)}</text>
  `;
  schemeState.sheetCurveMeta = { ...curveData, visibleSeries, selectedSeries, width, height, padLeft, padRight, padTop, padBottom, plotWidth, plotHeight, minValue, valueSpan, xMin, xMax, xSpan, numericX };
}

function shortAxisLabel(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 11)}...` : text;
}

function onSheetCurveMouseMove(event) {
  const point = sheetCurvePointFromPointer(event, { allowAnyVisible: true });
  const tip = document.getElementById("sheetCurveTip");
  const svg = document.getElementById("sheetCurveChart");
  if (!point || !tip || !svg) {
    hideSheetCurveTip();
    return;
  }
  tip.hidden = false;
  const unit = point.series.unit;
  const unitText = unit
    ? `<br>切入/额定/切出：${escapeHtml(fmt(unit.cutIn))} / ${escapeHtml(fmt(unit.ratedSpeed))} / ${escapeHtml(fmt(unit.cutOut))} m/s`
    : "";
  tip.innerHTML = `${escapeHtml(point.series.title)}：${escapeHtml(fmt(point.sourcePoint.value))} ${escapeHtml(schemeState.sheetCurveMeta.yTitle || "")}<br>${escapeHtml(schemeState.sheetCurveMeta.xTitle)}：${escapeHtml(point.sourcePoint.label)}${unitText}`;
  positionSheetCurveTip(tip, svg.getBoundingClientRect(), event);
}

function hideSheetCurveTip() {
  const tip = document.getElementById("sheetCurveTip");
  if (tip) tip.hidden = true;
}

function positionSheetCurveTip(tip, bounds, event) {
  const margin = 8;
  const tipWidth = tip.offsetWidth || 190;
  const tipHeight = tip.offsetHeight || 58;
  const left = Math.min(Math.max(event.clientX + 12, bounds.left + margin), Math.max(bounds.left + margin, bounds.right - tipWidth - margin));
  const top = Math.min(Math.max(event.clientY - tipHeight - 10, bounds.top + margin), Math.max(bounds.top + margin, bounds.bottom - tipHeight - margin));
  const parent = tip.offsetParent || document.body;
  const parentRect = parent.getBoundingClientRect();
  tip.style.left = `${left - parentRect.left + (parent.scrollLeft || 0)}px`;
  tip.style.top = `${top - parentRect.top + (parent.scrollTop || 0)}px`;
}

function startSheetCurveDrag(event) {
  if (!schemeState.sheetCurveMeta) return;
  if (schemeState.sheetCurveMeta.editable === false) return;
  if (event.button !== undefined && event.button !== 0) return;
  if (event.isPrimary === false) return;
  const chart = document.getElementById("sheetCurveChart");
  if (!chart) return;
  const point = sheetCurvePointFromPointer(event, { allowAnyVisible: true });
  if (!point) return;
  schemeState.selectedCurveKey = point.series.key;
  event.preventDefault();
  schemeState.sheetCurveDrag = { pointerId: event.pointerId, edited: false, lastPoint: null };
  chart.classList.add("editing");
  chart.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", onSheetCurveDragMove);
  window.addEventListener("pointerup", endSheetCurveDrag);
  window.addEventListener("pointercancel", endSheetCurveDrag);
  applySheetCurveEdit(event);
}

function onSheetCurveDragMove(event) {
  if (!schemeState.sheetCurveDrag) return;
  if (event.pointerId !== undefined && schemeState.sheetCurveDrag.pointerId !== undefined && event.pointerId !== schemeState.sheetCurveDrag.pointerId) return;
  event.preventDefault();
  applySheetCurveEdit(event);
}

function endSheetCurveDrag(event) {
  if (!schemeState.sheetCurveDrag) return;
  if (event?.pointerId !== undefined && schemeState.sheetCurveDrag.pointerId !== undefined && event.pointerId !== schemeState.sheetCurveDrag.pointerId) return;
  const chart = document.getElementById("sheetCurveChart");
  if (chart) {
    chart.classList.remove("editing");
    chart.releasePointerCapture?.(schemeState.sheetCurveDrag.pointerId);
  }
  schemeState.sheetCurveDrag = null;
  window.removeEventListener("pointermove", onSheetCurveDragMove);
  window.removeEventListener("pointerup", endSheetCurveDrag);
  window.removeEventListener("pointercancel", endSheetCurveDrag);
}

function applySheetCurveEdit(event) {
  const point = sheetCurveValueFromPointer(event);
  if (!point) return false;
  const points = interpolatedSheetCurveEditPoints(schemeState.sheetCurveDrag?.lastPoint, point);
  let edited = false;
  points.forEach((item) => {
    const row = schemeState.sheetCurveMeta.rows[item.index];
    if (!row) return;
    const value = roundSheetCurveValue(item.value);
    if (setSheetCellValue(row.excelRow, point.series.col, value, { render: false })) edited = true;
  });
  if (!edited) return false;
  if (schemeState.sheetCurveDrag) {
    schemeState.sheetCurveDrag.edited = true;
    schemeState.sheetCurveDrag.lastPoint = point;
  }
  renderSheetCurvePanel();
  onSheetCurveMouseMove(event);
  return true;
}

function sheetCurvePointFromPointer(event, options = {}) {
  const meta = schemeState.sheetCurveMeta;
  const svg = document.getElementById("sheetCurveChart");
  if (!meta || !svg) return null;
  const rect = svg.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * meta.width;
  const localY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * meta.height;
  const seriesList = options.allowAnyVisible ? meta.visibleSeries : [meta.selectedSeries].filter(Boolean);
  let best = null;
  seriesList.forEach((series) => {
    series.points.forEach((sourcePoint) => {
      const pointX = meta.numericX
        ? meta.padLeft + ((Number(sourcePoint.xValue) - meta.xMin) / meta.xSpan) * meta.plotWidth
        : meta.padLeft + (sourcePoint.xIndex / Math.max(1, meta.rows.length - 1)) * meta.plotWidth;
      const pointY = meta.padTop + meta.plotHeight - ((sourcePoint.value - meta.minValue) / meta.valueSpan) * meta.plotHeight;
      const distance = Math.hypot(localX - pointX, localY - pointY);
      if (!best || distance < best.distance) best = { series, sourcePoint, distance, localX, localY };
    });
  });
  if (!best || best.distance > 34) return null;
  return best;
}

function sheetCurveValueFromPointer(event) {
  const meta = schemeState.sheetCurveMeta;
  const svg = document.getElementById("sheetCurveChart");
  if (!meta || !svg || !meta.rows.length) return null;
  const rect = svg.getBoundingClientRect();
  const localX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * meta.width;
  const localY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * meta.height;
  const ratio = Math.min(1, Math.max(0, (localX - meta.padLeft) / meta.plotWidth));
  const index = Math.round(ratio * Math.max(0, meta.rows.length - 1));
  const yRatio = (meta.padTop + meta.plotHeight - localY) / meta.plotHeight;
  const value = meta.minValue + yRatio * meta.valueSpan;
  const series = meta.visibleSeries.find((item) => item.key === schemeState.selectedCurveKey) || meta.selectedSeries;
  if (!series) return null;
  return { index, value, series };
}

function interpolatedSheetCurveEditPoints(previousPoint, currentPoint) {
  const currentIndex = Math.round(Number(currentPoint?.index));
  const currentValue = Number(currentPoint?.value);
  if (!Number.isFinite(currentIndex) || !Number.isFinite(currentValue)) return [];
  const previousIndex = Math.round(Number(previousPoint?.index));
  const previousValue = Number(previousPoint?.value);
  if (!Number.isFinite(previousIndex) || !Number.isFinite(previousValue) || previousIndex === currentIndex) {
    return [{ index: currentIndex, value: currentValue }];
  }
  const startIndex = Math.min(previousIndex, currentIndex);
  const endIndex = Math.max(previousIndex, currentIndex);
  const indexSpan = currentIndex - previousIndex;
  const valueSpan = currentValue - previousValue;
  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
    const index = startIndex + offset;
    const ratio = (index - previousIndex) / indexSpan;
    return { index, value: previousValue + valueSpan * ratio };
  });
}

function roundSheetCurveValue(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000000) / 1000000;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

async function createScheme(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    const payload = await api("/api/schemes", { method: "POST", body: JSON.stringify(data) });
    schemeState.current = payload.scheme.name;
    event.target.reset();
    await loadSchemes();
  } catch (error) {
    showError(error);
  }
}

async function createSchemeFromTree() {
  openSchemeMetaDialog("create");
}

async function uploadScheme(event) {
  event.preventDefault();
  const body = new FormData(event.target);
  try {
    const payload = await api("/api/schemes/upload", { method: "POST", body });
    schemeState.current = payload.scheme.name;
    event.target.reset();
    await loadSchemes();
  } catch (error) {
    showError(error);
  }
}

async function importSchemeFromTree() {
  const name = prompt("请输入导入方案名称");
  if (!name) return;
  const input = document.querySelector("#uploadSchemeForm input[name='file']");
  input.value = "";
  input.onchange = async () => {
    if (!input.files || !input.files[0]) return;
    const body = new FormData();
    body.set("name", name);
    body.set("description", prompt("请输入方案说明", "") || "");
    body.set("file", input.files[0]);
    try {
      const payload = await api("/api/schemes/upload", { method: "POST", body });
      schemeState.current = payload.scheme.name;
      await loadSchemes();
    } catch (error) {
      showError(error);
    }
  };
  input.click();
}

async function editSelectedScheme() {
  if (!schemeState.current) return;
  const scheme = schemeState.schemes.find((item) => item.name === schemeState.current) || {};
  openSchemeMetaDialog("edit", scheme);
}

async function copyScheme() {
  const name = prompt("请输入复制后的方案名称", `${schemeState.current}_副本`);
  if (!name) return;
  try {
    const payload = await api("/api/schemes/copy", {
      method: "POST",
      body: JSON.stringify({ source: schemeState.current, name, description: `复制自 ${schemeState.current}` }),
    });
    schemeState.current = payload.scheme.name;
    await loadSchemes();
  } catch (error) {
    showError(error);
  }
}

async function deleteScheme() {
  if (!schemeState.current || !confirm(`确认删除方案“${schemeState.current}”？`)) return;
  try {
    await api(`/api/schemes?name=${encodeURIComponent(schemeState.current)}`, { method: "DELETE" });
    schemeState.current = "";
    schemeState.currentSheet = "";
    await loadSchemes();
  } catch (error) {
    showError(error);
  }
}

function readVisibleCellsToState(options = {}) {
  const table = document.getElementById("sheetTable");
  if (!table) return;
  table.querySelectorAll("td[data-r][data-c]").forEach((cell) => {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const localIndex = localRowIndexFromExcelRow(r);
    const colIndex = c - 1;
    if (localIndex < 0 || colIndex < 0) return;
    const value = parseCellValue(cell.textContent || "");
    if (!schemeState.rows[localIndex]) schemeState.rows[localIndex] = [];
    schemeState.rows[localIndex][colIndex] = value;
    if (options.mark) markCellUpdate(r, c, value);
  });
}

function sheetColumnCount() {
  return Math.max(1, ...schemeState.rows.map((row) => row.length));
}

function visibleBodyRowIndexes() {
  return sheetPageRows().map((item) => item.index);
}

async function addSheetRow() {
  if (!schemeState.currentSheet || schemeState.currentSheet === "计算参数") return;
  readVisibleCellsToState();
  if (pendingUpdateCount()) {
    showError(new Error("请先保存当前单元格修改，再添加行"));
    return;
  }
  const colCount = sheetColumnCount();
  const afterRow = schemeState.selectedExcelRow || Number(schemeState.sheetMeta.body_end_row || 1) || 1;
  try {
    const payload = await api("/api/sheet", {
      method: "PUT",
      body: JSON.stringify({
        scheme: schemeState.current,
        sheet: schemeState.currentSheet,
        operation: "insert_row",
        after_row: afterRow,
        values: Array.from({ length: colCount }, () => null),
        page: schemeState.sheetPage,
        page_size: schemeState.sheetPageSize,
      }),
    });
    schemeState.rows = payload.rows || [];
    schemeState.sheetMeta = payload;
    schemeState.sheetPage = Number(payload.page || schemeState.sheetPage);
    await loadSpecialCurveRows(payload);
    schemeState.selectedExcelRow = Math.min(afterRow + 1, Number(payload.max_rows || afterRow + 1));
    schemeState.selectedRowIndex = localRowIndexFromExcelRow(schemeState.selectedExcelRow);
    document.getElementById("saveHint").textContent = "已添加一行并写入 Excel。";
    renderSheetPager();
    renderSheetCurvePanel();
    renderSheetTable();
  } catch (error) {
    showError(error);
  }
}

async function deleteSheetRow() {
  if (!schemeState.currentSheet || schemeState.currentSheet === "计算参数") return;
  readVisibleCellsToState();
  if (pendingUpdateCount()) {
    showError(new Error("请先保存当前单元格修改，再删除行"));
    return;
  }
  if (!schemeState.selectedExcelRow || schemeState.selectedExcelRow <= 1) {
    showError(new Error("请先选择要删除的正文行"));
    return;
  }
  if (!confirm("确认删除当前选中行？")) return;
  const deleteRow = schemeState.selectedExcelRow;
  try {
    const payload = await api("/api/sheet", {
      method: "PUT",
      body: JSON.stringify({
        scheme: schemeState.current,
        sheet: schemeState.currentSheet,
        operation: "delete_row",
        row: deleteRow,
        page: schemeState.sheetPage,
        page_size: schemeState.sheetPageSize,
      }),
    });
    schemeState.rows = payload.rows || [];
    schemeState.sheetMeta = payload;
    schemeState.sheetPage = Number(payload.page || schemeState.sheetPage);
    await loadSpecialCurveRows(payload);
    const nextRow = sheetPageRows().find((item) => item.excelRow >= deleteRow) || sheetPageRows().at(-1);
    schemeState.selectedRowIndex = nextRow?.index || 0;
    schemeState.selectedExcelRow = nextRow?.excelRow || 0;
    document.getElementById("saveHint").textContent = "已删除一行并写入 Excel。";
    renderSheetPager();
    renderSheetCurvePanel();
    renderSheetTable();
  } catch (error) {
    showError(error);
  }
}

function showSheetContextMenu(x, y) {
  const menu = document.getElementById("sheetContextMenu");
  if (!menu) return;
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  menu.querySelectorAll("[data-sheet-action]").forEach((button) => {
    button.onclick = () => runSheetMenuAction(button.dataset.sheetAction);
  });
}

function hideSheetContextMenu() {
  const menu = document.getElementById("sheetContextMenu");
  if (menu) menu.hidden = true;
}

function runSheetMenuAction(action) {
  hideSheetContextMenu();
  if (action === "add-after") addSheetRow();
  if (action === "delete-row") deleteSheetRow();
}

async function saveSheet() {
  readVisibleCellsToState();
  const updates = Object.values(schemeState.pendingCellUpdates || {});
  if (!updates.length) {
    document.getElementById("saveHint").textContent = "没有需要保存的单元格修改。";
    return;
  }
  try {
    const payload = await api("/api/sheet", {
      method: "PUT",
      body: JSON.stringify({
        scheme: schemeState.current,
        sheet: schemeState.currentSheet,
        updates,
        page: schemeState.sheetPage,
        page_size: schemeState.sheetPageSize,
      }),
    });
    schemeState.rows = payload.rows || schemeState.rows;
    schemeState.sheetMeta = payload;
    schemeState.pendingCellUpdates = {};
    applyPendingUpdatesToLoadedRows();
    await loadSpecialCurveRows(payload);
    document.getElementById("saveHint").textContent = `已保存 ${updates.length} 个单元格：${new Date().toLocaleTimeString("zh-CN")}`;
    renderSheetPager();
    renderSheetCurvePanel();
    renderSheetTable();
  } catch (error) {
    showError(error);
  }
}

function parseCellValue(text) {
  const value = String(text || "").trim();
  if (value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(value) ? num : value;
}

function showError(error) {
  setError("schemeError", error.message || "操作失败");
}

function showSchemeContextMenu(x, y) {
  const menu = document.getElementById("schemeContextMenu");
  if (!menu) return;
  const hasScheme = Boolean(schemeState.contextScheme || schemeState.current);
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  menu.querySelectorAll("[data-action]").forEach((button) => {
    const needsScheme = ["open", "edit", "copy", "delete"].includes(button.dataset.action);
    button.disabled = needsScheme && !hasScheme;
    button.onclick = () => runSchemeMenuAction(button.dataset.action);
  });
}

function hideSchemeContextMenu() {
  const menu = document.getElementById("schemeContextMenu");
  if (menu) menu.hidden = true;
}

function runSchemeMenuAction(action) {
  hideSchemeContextMenu();
  if (schemeState.contextScheme) schemeState.current = schemeState.contextScheme;
  if (action === "open") loadScheme(schemeState.current).catch(showError);
  if (action === "create") createSchemeFromTree();
  if (action === "import") importSchemeFromTree();
  if (action === "edit") editSelectedScheme();
  if (action === "copy") copyScheme();
  if (action === "delete") deleteScheme();
}
