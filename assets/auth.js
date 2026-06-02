async function requireAuth() {
  const data = await api("/api/auth/me");
  if (!data.authenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.href = `/login.html?next=${next}`;
    return null;
  }
  renderAuthUser(data.user);
  return data.user;
}

function renderAuthUser(user) {
  document.querySelectorAll("[data-auth-user]").forEach((node) => {
    node.hidden = false;
  });
  document.querySelectorAll("[data-auth-username]").forEach((node) => {
    node.textContent = user?.username || "-";
  });
  document.querySelectorAll("[data-auth-role]").forEach((node) => {
    node.textContent = user?.role || "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  requireAuth().catch(() => {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.href = `/login.html?next=${next}`;
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      } finally {
        location.href = "/login.html";
      }
    });
  });
});
