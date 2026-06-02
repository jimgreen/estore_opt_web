function nextUrl() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "/index.html";
  return next.startsWith("/") ? next : "/index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-auth-form]");
  const status = document.querySelector("[data-auth-status]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = form.dataset.authForm;
    const data = new FormData(form);
    const payload = {
      username: String(data.get("username") || "").trim(),
      password: String(data.get("password") || ""),
    };
    const confirmPassword = String(data.get("confirm_password") || "");
    if (mode === "register" && payload.password !== confirmPassword) {
      status.textContent = window.t ? window.t("auth.passwordMismatch") : "两次输入的密码不一致";
      status.hidden = false;
      return;
    }

    status.hidden = true;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      location.href = nextUrl();
    } catch (error) {
      status.textContent = error.message || (window.t ? window.t("auth.failed") : "操作失败");
      status.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
});
