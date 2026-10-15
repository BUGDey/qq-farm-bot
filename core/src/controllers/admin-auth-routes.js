const fs = require("node:fs");
const path = require("node:path");
const { getDataFile } = require("../config/runtime-paths");
const { readJsonFile, writeJsonFileAtomic } = require("../services/json-db");

const ADMIN_USERNAME = "admin";
const ADMIN_CONFIG_FILE = getDataFile("admin-config.json");

// 读取管理员配置
function loadAdminConfig() {
  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const config = readJsonFile(ADMIN_CONFIG_FILE);
      return {
        password: config?.password || "admin",
      };
    }
  } catch (err) {
    console.error("读取管理员配置失败:", err);
  }
  return { password: "admin" };
}

// 保存管理员配置
function saveAdminConfig(config) {
  try {
    writeJsonFileAtomic(ADMIN_CONFIG_FILE, config);
    return true;
  } catch (err) {
    console.error("保存管理员配置失败:", err);
    return false;
  }
}

let adminConfig = loadAdminConfig();

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
    if (username !== ADMIN_USERNAME || password !== adminConfig.password) {
      return res.status(401).json({ ok: false, error: "用户名或密码错误" });
    }
    return sendAdminSession(res, createAdminSession);
  });

  // 修改密码接口
  app.post("/api/change-password", (req, res) => {
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "旧密码和新密码不能为空" });
    }

    if (oldPassword !== adminConfig.password) {
      return res.status(401).json({ ok: false, error: "旧密码错误" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: "新密码长度至少为 6 位" });
    }

    // 保存新密码到配置文件
    adminConfig.password = newPassword;
    const saved = saveAdminConfig(adminConfig);

    if (!saved) {
      return res.status(500).json({ ok: false, error: "密码保存失败，请重试" });
    }

    return res.json({ ok: true, message: "密码修改成功" });
  });
}

module.exports = { registerAdminAuthRoutes };
