const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin";

function createDefaultAdmin() {
  return {
    username: ADMIN_USERNAME,
    role: "admin",
    card: null,
    accountLimit: Number.MAX_SAFE_INTEGER,
    mustChangePassword: false,
  };
}

function sendAdminSession(res, createAdminSession) {
  const admin = createDefaultAdmin();
  const token = createAdminSession(admin);
  return res.json({
    ok: true,
    data: {
      token,
      role: admin.role,
      card: null,
      accountLimit: admin.accountLimit,
      user: { username: admin.username },
      mustChangePassword: false,
    },
  });
}

function registerAdminAuthRoutes({ app, createAdminSession }) {
  app.post("/api/auto-login", (_req, res) =>
    sendAdminSession(res, createAdminSession),
  );

  // 保留 admin/admin 供 API 客户端兼容；不再支持注册、续费或找回密码。
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body || {};
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "用户名或密码错误" });
    }
    return sendAdminSession(res, createAdminSession);
  });
}

module.exports = { registerAdminAuthRoutes };
