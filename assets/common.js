async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body instanceof FormData ? options.headers || {} : { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "请求失败");
    error.payload = data;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setError(id, message) {
  const target = document.getElementById(id);
  if (!target) return;
  target.textContent = message || "";
  target.hidden = !message;
}

function fmt(value, digits = 3) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return typeof value === "string" ? value : "-";
  if (Math.abs(num) >= 1000) return num.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  return num.toFixed(digits).replace(/\.?0+$/, "");
}

window.formatTimeOfDay = function formatTimeOfDay(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "-";
  const match = text.match(/(?:^|\D)(\d{1,2}:\d{2}:\d{2})(?:\.\d+)?(?:$|\D)/);
  if (match) return match[1].padStart(8, "0");
  return text;
};

function statusClass(status) {
  if (["计算中", "准备启动"].includes(status)) return "running";
  if (status === "排队中") return "queued";
  if (status === "完成计算") return "done";
  if (["计算失败", "计算中止", "退出队列"].includes(status)) return "failed";
  return "";
}

function formConfig(form) {
  const data = new FormData(form);
  const cfg = {};
  for (const [key, value] of data.entries()) {
    if (["tight_temp_bounds", "build_only", "strict_current_sos2"].includes(key)) {
      cfg[key] = true;
    } else if (["time_limit", "mip_gap", "dt_minutes", "soc_grid_width", "heuristics"].includes(key)) {
      cfg[key] = Number(value);
    } else if (["current_segments", "threads", "mip_focus", "max_parallel"].includes(key)) {
      cfg[key] = Number.parseInt(value, 10);
    } else {
      cfg[key] = value;
    }
  }
  for (const name of ["tight_temp_bounds", "build_only", "strict_current_sos2"]) {
    if (form.elements[name] && !data.has(name)) cfg[name] = false;
  }
  return cfg;
}
