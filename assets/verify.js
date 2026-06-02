const verifyState = {
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
  initializeVerifyPage().catch(showVerifyError);
  verifyState.timer = window.setInterval(loadVerifications, 4000);
});

async function initializeVerifyPage() {
  const params = new URLSearchParams(window.location.search);
  verifyState.selectedId = params.get("verification") || "";
  const payload = await api("/api/schemes");
  const select = document.querySelector("#verifyForm select[name='scheme']");
  select.innerHTML = (payload.schemes || []).map((scheme) => `<option value="${escapeHtml(scheme.name)}">${escapeHtml(scheme.name)}</option>`).join("");
  await loadVerifications();
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
  renderVerificationRows(item.rows_preview || []);
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
  const fields = [
    ["SOC最大偏差", metrics.soc?.max_abs],
    ["SOC MAE", metrics.soc?.mae],
    ["电芯温度最大偏差(℃)", metrics.t_bat_c?.max_abs],
    ["液冷罐温度最大偏差(℃)", metrics.t_tank_c?.max_abs],
    ["舱体温度最大偏差(℃)", metrics.t_cont_c?.max_abs],
    ["端口电压最大偏差(V)", metrics.u_terminal_v?.max_abs],
    ["BESS功率最大偏差(kW)", metrics.pbess_kw?.max_abs],
    ["优化Gap", metrics.gap],
  ];
  document.getElementById("verificationMetrics").innerHTML = fields.map(([label, value]) => `
    <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(fmt(value, 6))}</strong></div>
  `).join("");
}

function renderVerificationRows(rows) {
  const target = document.getElementById("verificationRows");
  if (!rows.length) {
    target.innerHTML = `<div class="scheme-item">暂无逐时刻数据。</div>`;
    return;
  }
  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>步</th>
          <th>小时</th>
          <th>SOC优化</th>
          <th>SOC仿真</th>
          <th>SOC偏差</th>
          <th>电芯温度偏差</th>
          <th>端口电压偏差</th>
          <th>BESS功率偏差</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.step)}</td>
            <td>${escapeHtml(fmt(row.hour, 3))}</td>
            <td>${escapeHtml(fmt(row.soc_opt, 6))}</td>
            <td>${escapeHtml(fmt(row.soc_sim, 6))}</td>
            <td>${escapeHtml(fmt(row.soc_error, 6))}</td>
            <td>${escapeHtml(fmt(row.t_bat_error_c, 6))}</td>
            <td>${escapeHtml(fmt(row.u_terminal_error_v, 6))}</td>
            <td>${escapeHtml(fmt(row.pbess_error_kw, 6))}</td>
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
