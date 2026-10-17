const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const { getDataFile } = require("../config/runtime-paths");

const LOGIN_ASSETS_DIR = getDataFile("login-assets");
const LOGIN_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGIN_LOGO_EXTENSIONS = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["image/x-icon", ".ico"],
  ["image/vnd.microsoft.icon", ".ico"],
]);

fs.mkdirSync(LOGIN_ASSETS_DIR, { recursive: true });

const loginLogoUpload = multer({
  storage: multer.diskStorage({
    destination: LOGIN_ASSETS_DIR,
    filename(req, file, callback) {
      callback(null, `${crypto.randomUUID()}${LOGIN_LOGO_EXTENSIONS.get(file.mimetype)}`);
    },
  }),
  limits: { fileSize: LOGIN_LOGO_MAX_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    if (!LOGIN_LOGO_EXTENSIONS.has(file.mimetype)) {
      return callback(new Error("仅支持 PNG、JPG、WebP、GIF、SVG 或 ICO 图片"));
    }
    return callback(null, true);
  },
}).single("file");

function deleteManagedLoginLogo(logoUrl) {
  const prefix = "/login-assets/";
  const value = String(logoUrl || "");
  if (!value.startsWith(prefix)) return;
  const filename = path.basename(value.slice(prefix.length));
  if (!filename) return;
  try {
    fs.unlinkSync(path.join(LOGIN_ASSETS_DIR, filename));
  } catch {}
}

function registerAdminSystemRoutes({
  app,
  store,
  logger,
  requireAdminToken,
  requireAdminRole,
  requireSuperAdminRole,
  requireDangerConfirmation,
  getDefaultSystemConfig,
  getRuntimeConfig,
  updateRuntimeConfig,
}) {
  const isAllowedPublicLink = (value) => {
    const link = String(value || "").trim();
    return (
      !link ||
      link.startsWith("/") ||
      /^https?:\/\//i.test(link) ||
      /^mqqapi:\/\//i.test(link)
    );
  };

  const isAllowedImageLink = (value) => {
    const link = String(value || "").trim();
    return !link || link.startsWith("/") || /^https?:\/\//i.test(link);
  };

  app.get(
   "/api/admin/system-config",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        res.json({
          ok: true,
          data: {
            saved: store.getSystemConfig(),
            default: getDefaultSystemConfig(),
            current: getRuntimeConfig(),
          },
        });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  // 系统配置视图：任何登录用户可看（不含运行时快照，运行时快照仅管理员可见）。
  app.get("/api/system-config", requireAdminToken, (req, res) => {
    try {
      res.json({
        ok: true,
        data: {
          saved: store.getSystemConfig(),
          default: getDefaultSystemConfig(),
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // 系统配置的修改与重置对所有登录用户开放（与 /api/admin/system-config 同一套逻辑，
  // 仅角色门槛不同；管理后台的其他功能仍仅管理员可见）。
  function handleUpdateSystemConfig(req, res) {
    try {
      if (!requireDangerConfirmation(req, res, "UPDATE_SYSTEM_CONFIG")) return;
      const { serverUrl, clientVersion, platform, os } = req.body || {};
      const saved = store.setSystemConfig({
        serverUrl,
        clientVersion,
        platform,
        os,
      });
      updateRuntimeConfig(saved);
      logger.warn("更新系统配置", {
        admin: req.currentUser?.username || "",
        serverUrl: saved?.serverUrl || "",
        clientVersion: saved?.clientVersion || "",
        platform: saved?.platform || "",
        os: saved?.os || "",
        confirmation: "UPDATE_SYSTEM_CONFIG",
      });
      res.json({
        ok: true,
        data: {
          saved,
          current: getRuntimeConfig(),
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }

  function handleResetSystemConfig(req, res) {
    try {
      if (!requireDangerConfirmation(req, res, "RESET_SYSTEM_CONFIG")) return;
      const saved = getDefaultSystemConfig();
      store.setSystemConfig(saved);
      updateRuntimeConfig(saved);
      logger.warn("重置系统配置", {
        admin: req.currentUser?.username || "",
        confirmation: "RESET_SYSTEM_CONFIG",
      });
      res.json({
        ok: true,
        data: {
          saved,
          current: getRuntimeConfig(),
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }

  app.post("/api/system-config", requireAdminToken, handleUpdateSystemConfig);
  app.post("/api/system-config/reset", requireAdminToken, handleResetSystemConfig);

  // 默认版本号快捷设置（管理后台全局设置用）：只改 clientVersion，其余字段保持不变，
  // 保存后立即同步到运行时（所有账号 worker 经配置同步拿到新版本号）。
  const CLIENT_VERSION_RE = /^\d+(?:\.\d+){2,4}_\d{8}$/;
  app.post(
    "/api/admin/default-version",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "UPDATE_SYSTEM_CONFIG")) return;
        const clientVersion = String((req.body || {}).clientVersion || "").trim();
        if (!clientVersion) {
          return res.status(400).json({ ok: false, error: "请填写默认版本号" });
        }
        if (!CLIENT_VERSION_RE.test(clientVersion)) {
          return res.status(400).json({ ok: false, error: "版本号格式不正确，应形如 1.15.0.2_20261001" });
        }
        const current = store.getSystemConfig() || getDefaultSystemConfig();
        const saved = store.setSystemConfig({ ...current, clientVersion });
        updateRuntimeConfig(saved);
        logger.warn("更新默认版本号", {
          admin: req.currentUser?.username || "",
          clientVersion,
          confirmation: "UPDATE_SYSTEM_CONFIG",
        });
        res.json({ ok: true, data: { saved, current: getRuntimeConfig() } });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.get("/api/public/login-links", (req, res) => {
    try {
      res.json({ ok: true, data: store.getLoginLinks() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // 普通用户是否可见全部农场账号（默认关闭：普通用户只能看到自己添加的账号）
  app.get("/api/admin/account-visibility", requireAdminToken, requireAdminRole, (req, res) => {
    try {
      res.json({ ok: true, data: { usersSeeAllAccounts: store.getUsersSeeAllAccounts() } });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/admin/account-visibility", requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const enabled = (req.body || {}).usersSeeAllAccounts === true;
      const saved = store.setUsersSeeAllAccounts(enabled);
      logger.warn("更新账号可见性开关", {
        admin: req.currentUser?.username || "",
        usersSeeAllAccounts: saved,
      });
      res.json({ ok: true, data: { usersSeeAllAccounts: saved } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post(
   "/api/admin/system-config",
    requireAdminToken,
    requireAdminRole,
    handleUpdateSystemConfig,
  );

  app.post(
    "/api/admin/system-config/reset",
    requireAdminToken,
    requireAdminRole,
    handleResetSystemConfig,
  );

}

module.exports = { registerAdminSystemRoutes };
