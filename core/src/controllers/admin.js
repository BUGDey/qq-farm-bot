/**
 * Admin Panel Controller
 * QQ Farm Automation Bot - 管理面板服务器
 *
 * 提供 Express + Socket.IO 管理面板后端：
 * - 默认管理员会话
 * - 账号管理（增删改查/启动停止/备注）
 * - 农场操作（种植/施肥/铲除/收获）
 * - 好友管理（列表/操作/拉黑）
 * - 商店/图鉴/活动/背包
 * - 系统设置/公告/代理/二维码登录
 * - 实时状态推送（WebSocket）
 */
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { Server: SocketIOServer } = require("socket.io");
const {
  CONFIG,
  updateRuntimeConfig,
  getRuntimeConfig,
  getDefaultSystemConfig,
} = require("../config/config");
const { getDataFile, getResourcePath } = require("../config/runtime-paths");
const store = require("../models/store");
const { addOrUpdateAccount, deleteAccount } = store;
const { findAccountByRef } = require("../services/account-resolver");
const { createModuleLogger } = require("../services/logger");
const { createScheduler } = require("../services/scheduler");
const adminScheduler = createScheduler("admin");
const { registerAdminActivityRoutes } = require("./admin-activity-routes");
const { registerAdminYYBRoutes } = require("./admin-yyb-routes");
const {
  registerAdminAccountRuntimeRoutes,
} = require("./admin-account-runtime-routes");
const { registerAdminAccountRoutes } = require("./admin-account-routes");
const { registerAdminAnalyticsRoutes } = require("./admin-analytics-routes");
const {
  createAdminAccountAccess,
  isAccountOwner,
} = require("./admin-account-access");
const { registerAdminAuthRoutes } = require("./admin-auth-routes");
const { registerAdminBagRoutes } = require("./admin-bag-routes");
const { registerAdminCareerRoutes } = require("./admin-career-routes");
const { registerAdminCaptureRoutes, setEmbeddedCapture } = require("./admin-capture-routes");
const { createCaptureCore } = require("../capture/index");
const { registerAdminCurrentUserRoutes } = require("./admin-current-user-routes");
const { registerAnnouncementRoutes } = require("./announcement-routes");
const { registerPublicRenewRoutes } = require("./public-renew-routes");
const {
  registerAdminFarmOperationRoutes,
} = require("./admin-farm-operation-routes");
const {
  registerAdminFarmResourceRoutes,
} = require("./admin-farm-resource-routes");
const { registerAdminFriendRoutes } = require("./admin-friend-routes");
const { registerAdminIllustratedRoutes } = require("./admin-illustrated-routes");
const { registerAdminPetRoutes } = require("./admin-pet-routes");
const {
  registerAdminPlantBlacklistRoutes,
} = require("./admin-plant-blacklist-routes");
const { registerAdminProxyRoutes } = require("./admin-proxy-routes");
const { registerAdminPublicInfoRoutes } = require("./admin-public-info-routes");
const { registerAdminQrLoginRoutes } = require("./admin-qr-login-routes");
const { registerAdminNapcatLoginRoutes } = require("./admin-napcat-login-routes");
const { createAdminRouteHelpers } = require("./admin-route-helpers");
const { registerAdminSettingsRoutes } = require("./admin-settings-routes");
const { registerAdminShopRoutes } = require("./admin-shop-routes");
const { createAdminSessionManager } = require("./admin-session-manager");
const { registerAdminSystemRoutes } = require("./admin-system-routes");
const { registerAdminUserRoutes } = require("./admin-user-routes");
const { registerAdminCardRoutes } = require("./admin-card-routes");
const { registerAdminLoginLogRoutes } = require("./admin-login-log-routes");
const userStore = require("../models/user-store");

const adminLogger = createModuleLogger("admin");
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];
const PUBLIC_API_PATHS = new Set([
  "/login",
  "/register",
  "/auto-login",
  "/qr/create",
  "/qr/check",
  "/game-version",
  "/public/login-links",
  "/changelog",
  "/health",
  "/card-claim/status",
  "/card-claim/claim",
]);
/** 前缀匹配的公开路径（/api 之后的部分） */
const PUBLIC_API_PREFIXES = [
  "/card/info/",
  "/public/renew",
  "/public/account-status",
  "/public/reset-password/",
];
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const LOG_SNAPSHOT_LIMIT = 100;
const HTTP_REQUEST_TIMEOUT_MS = 120 * 1000;
const HTTP_HEADERS_TIMEOUT_MS = 16 * 1000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 5 * 1000;
const HTTP_CONNECTION_IDLE_TIMEOUT_MS = 30 * 1000;
const HTTP_CLOSE_WAIT_SWEEP_MS = 5000;

let app = null;
let server = null;
let provider = null;
let io = null;
let embeddedCaptureCore = null;

function emitRealtimeStatus(accountId, status) {
  if (!io) return;
  accountId = String(accountId || "").trim();
  if (!accountId) return;
  io.to(`account:${  accountId}`).emit("status:update", {
    accountId,
    status,
  });
}

function emitRealtimeLog(logEntry) {
  if (!io) return;
  const safeLogEntry = logEntry && typeof logEntry === "object" ? logEntry : {};
  const accountId = String(safeLogEntry.accountId || "").trim();
  if (!accountId) return;
  io.to(`account:${  accountId}`).emit("log:new", safeLogEntry);
}

function emitRealtimeAccountLog(logEntry) {
  if (!io) return;
  const safeLogEntry = logEntry && typeof logEntry === "object" ? logEntry : {};
  const accountId = String(safeLogEntry.accountId || "").trim();
  if (!accountId) return;
  io.to(`account:${  accountId}`).emit("account-log:new", safeLogEntry);
}

function configureCorsMiddleware(expressApp) {
  expressApp.use((req, res, next) => {
    const allowedOrigins = CONFIG.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS;
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS, PUT");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, x-account-id, x-admin-token",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    return next();
  });
}

function configureStaticAssets(expressApp, webDist) {
  if (fs.existsSync(webDist)) {
    expressApp.use(express.static(webDist));
    return;
  }
  adminLogger.warn("web build not found", { webDist });
  expressApp.get("/", (req, res) =>
    res.send("web build not found. Please build the web project."),
  );
}

function isPublicApiPath(path) {
  if (PUBLIC_API_PATHS.has(path)) return true;
  if (PUBLIC_API_PREFIXES.some(prefix => path.startsWith(prefix))) return true;
  return path.startsWith("/public/capture-certificate/");
}

function registerAuthGate(expressApp, requireAdminToken) {
  expressApp.use("/api", (req, res, next) => {
    if (isPublicApiPath(req.path)) return next();
    return requireAdminToken(req, res, next);
  });
}

function registerLogoutRoute(expressApp, invalidateAdminSessionAndDisconnect) {
  expressApp.post("/api/logout", (req, res) => {
    const token = req.adminToken;
    if (token) invalidateAdminSessionAndDisconnect(token);
    res.json({ ok: true });
  });
}

function registerHealthRoute(expressApp) {
  expressApp.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });
}

function registerRequestTimeoutGuard(expressApp) {
  expressApp.use((req, res, next) => {
    if (req.path === "/api/health") return next();

    const timeout = setTimeout(() => {
      if (res.headersSent || res.writableEnded || res.destroyed) return;
      res.locals.requestTimedOut = true;
      res.status(503).json({
        ok: false,
        error: "Request Timeout",
      });
    }, HTTP_REQUEST_TIMEOUT_MS);

    res.on("finish", () => clearTimeout(timeout));
    res.on("close", () => clearTimeout(timeout));
    return next();
  });
}

function registerSpaFallback(expressApp, webDist) {
  expressApp.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/game-config")) {
      return res.status(404).json({
        ok: false,
        error: "Not Found",
      });
    }
    if (fs.existsSync(webDist)) {
      return res.sendFile(path.join(webDist, "index.html"));
    }
    return res
      .status(404)
      .send("web build not found. Please build the web project.");
  });
}

function configureHttpServerTimeouts(httpServer) {
  httpServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  httpServer.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  httpServer.timeout = HTTP_CONNECTION_IDLE_TIMEOUT_MS;
  httpServer.setTimeout(HTTP_CONNECTION_IDLE_TIMEOUT_MS, (socket) => {
    socket.destroy();
  });
}

function trackHttpConnections(httpServer) {
  const sockets = new Set();
  const sweepTimer = setInterval(() => {
    for (const socket of sockets) {
      if (socket.destroyed) {
        sockets.delete(socket);
        continue;
      }
      if (socket.readableEnded || socket.writableEnded) {
        socket.destroy();
        sockets.delete(socket);
      }
    }
  }, HTTP_CLOSE_WAIT_SWEEP_MS);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();

  httpServer.on("connection", (socket) => {
    sockets.add(socket);
    socket.setNoDelay(true);
    socket.setKeepAlive(false);
    socket.setTimeout(HTTP_CONNECTION_IDLE_TIMEOUT_MS);
    socket.on("end", () => {
      socket.destroy();
      sockets.delete(socket);
    });
    socket.on("timeout", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });
  httpServer.on("close", () => {
    clearInterval(sweepTimer);
    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.clear();
  });
}

function leaveAccountRooms(socket) {
  for (const room of socket.rooms) {
    if (room.startsWith("account:")) socket.leave(room);
  }
}

/** 仅超级管理员豁免账号归属校验（订阅他人账号的实时推送房间） */
function isSuperAdminSession(session) {
  return session.role === "super_admin";
}

function getSocketHandshakeToken(socket) {
  const authToken =
    socket.handshake.auth && socket.handshake.auth.token
      ? String(socket.handshake.auth.token)
      : "";
  const headerToken =
    socket.handshake.headers && socket.handshake.headers["x-admin-token"]
      ? String(socket.handshake.headers["x-admin-token"])
      : "";
  return authToken || headerToken;
}

/**
 * 启动嵌入本进程的抓包服务核心。
 * 需要 CA 生成与 proto 加载，均在后台上完成（core.ready）。
 */
function startEmbeddedCaptureService() {
  try {
    const captureConfig = store.getCaptureConfig();
    if (captureConfig.enabled !== true) {
      adminLogger.info("抓包服务未启动（enabled=false）");
      return null;
    }
    if (captureConfig.embedded === false) {
      adminLogger.info("抓包服务未嵌入本进程（embedded=false，使用独立服务）");
      return null;
    }
    if (embeddedCaptureCore) return embeddedCaptureCore;
    const captureLog = (level, message, extra) => {
      const fn = adminLogger[level] || adminLogger.info;
      fn.call(adminLogger, message, extra);
    };
    const core = createCaptureCore({ log: captureLog });
    embeddedCaptureCore = core;
    setEmbeddedCapture(core);
    core.ready.catch((error) => {
      adminLogger.warn("抓包服务嵌入初始化失败", { error: error.message });
    });
    adminLogger.info("抓包服务已嵌入本进程：手机代理端口 18000");
    return core;
  } catch (error) {
    adminLogger.warn("抓包服务嵌入启动失败", { error: error.message });
    return null;
  }
}

function ensureEmbeddedCaptureService() {
  return startEmbeddedCaptureService();
}

async function stopEmbeddedCaptureService() {
  const core = embeddedCaptureCore;
  embeddedCaptureCore = null;
  setEmbeddedCapture(null);
  if (!core || typeof core.stop !== "function") return;
  try {
    await core.stop();
  } catch (error) {
    adminLogger.warn("抓包服务嵌入停止失败", { error: error.message });
  }
}

function startAdminServer(dataProvider) {
  if (app) return;
  provider = dataProvider;
  app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "256kb" }));

  const adminSessionManager = createAdminSessionManager({
    logger: adminLogger,
    getIo: () => io,
  });
  const {
    cleanupInvalidAdminSessions,
    createAdminSession,
    getSession: getAdminSession,
    hasToken: hasAdminToken,
    invalidateAdminSessionAndDisconnect,
    invalidateAdminSessions,
    requireAdminToken,
    updateAdminSessions,
  } = adminSessionManager;

  const adminAccountAccess = createAdminAccountAccess({
    store,
    getProvider: () => provider,
  });
  const {
    canAccessAccount,
    getAccessibleAccountIdsForUser,
    getAccessibleAccountIdsFromRequest,
    getAccountIdFromRequest,
    getAccountsForUser,
    resolveAccountReference,
  } = adminAccountAccess;

  const adminRouteHelpers = createAdminRouteHelpers({
    store,
    userStore,
    logger: adminLogger,
    getProvider: () => provider,
  });
  const {
    getAdminUserMutationError,
    requireAdminRole,
    requireDangerConfirmation,
    requireSuperAdminRole,
    sendProviderError,
  } = adminRouteHelpers;

  const webDist = path.join(__dirname, "../../../web/dist");
  configureCorsMiddleware(app);
  configureStaticAssets(app, webDist);
  app.use(
    "/game-config",
    express.static(getResourcePath("gameConfig"), {
      setHeaders(res) {
        // 子版本号机制兜底：素材变化时前端会主动刷新缓存，可放心使用长强缓存
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      },
    }),
    // 素材插件回退链：宿主目录没命中的请求，依次在已激活 provider 的
    // <dir>/assets 下查找。provider 列表由 gameConfig 模块维护，插件激活/停用
    // 时自动更新，因此这里动态读取保证每次请求都能拿到最新列表。
    (req, res, next) => {
      const { getExternalGameConfigProviders } = require("../config/gameConfig");
      const providers = getExternalGameConfigProviders();
      // req.path 里非 ASCII 字符仍是 URL 编码，磁盘文件名是原始中文，
      // 必须先 decodeURIComponent 才能正确拼 fs 路径
      const rawPath = req.path.startsWith("/") ? req.path.slice(1) : req.path;
      const subPath = rawPath.includes("%") ? decodeURIComponent(rawPath) : rawPath;
      function tryNext(index) {
        if (index >= providers.length) return next();
        const root = path.join(providers[index].dir, "assets");
        const candidate = path.join(root, subPath);
        if (!candidate.startsWith(path.resolve(root))) return tryNext(index + 1);
        if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) return tryNext(index + 1);
        return express.static(root, {
          setHeaders(resp) {
            resp.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          },
        })(req, res, (e) => {
          if (e) return next(e);
          tryNext(index + 1);
        });
      }
      tryNext(0);
    },
  );
  const loginAssetsDir = getDataFile("login-assets");
  fs.mkdirSync(loginAssetsDir, { recursive: true });
  app.use(
    "/login-assets",
    express.static(loginAssetsDir, {
      dotfiles: "deny",
      setHeaders(res, filePath) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (path.extname(filePath).toLowerCase() === ".svg") {
          res.setHeader(
            "Content-Security-Policy",
            "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
          );
        }
      },
    }),
  );
  app.use("/login-assets", (req, res) => res.sendStatus(404));
  adminScheduler.setIntervalTask("session_cleanup", FIVE_MINUTES_MS, cleanupInvalidAdminSessions, {
    preventOverlap: true,
  });

  registerAdminAuthRoutes({
    app,
    logger: adminLogger,
    userStore,
    requireAdminToken,
    createAdminSession,
    updateAdminSessions,
  });
  registerHealthRoute(app);
  registerAuthGate(app, requireAdminToken);
  registerRequestTimeoutGuard(app);
  registerAdminPublicInfoRoutes({
    app,
    provider,
    store,
    userStore,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerLogoutRoute(app, invalidateAdminSessionAndDisconnect);

  registerAdminUserRoutes({
    app,
    requireAdminToken,
    requireAdminRole,
    requireSuperAdminRole,
    requireDangerConfirmation,
    getAdminUserMutationError,
    userStore,
    adminLogger,
    invalidateAdminSessions,
    updateAdminSessions,
    getAccountsForUser,
    store,
  });
  registerAdminCardRoutes({
    app,
    requireAdminToken,
    requireAdminRole,
    requireDangerConfirmation,
    userStore,
    adminLogger,
  });
  registerAdminLoginLogRoutes({
    app,
    requireAdminToken,
    requireAdminRole,
    requireDangerConfirmation,
    userStore,
    adminLogger,
  });

  registerAdminFarmResourceRoutes({
    app,
    provider,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminPetRoutes({
    app,
    provider,
    store,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminFriendRoutes({
    app,
    provider,
    store,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminPlantBlacklistRoutes({
    app,
    provider,
    store,
    requireAdminToken,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminShopRoutes({
    app,
    provider,
    adminLogger,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminActivityRoutes({
    app,
    provider,
    requireAdminToken,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminIllustratedRoutes({
    app,
    provider,
    adminLogger,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminCareerRoutes({
    app,
    provider,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminBagRoutes({
    app,
    provider,
    store,
    emitRealtimeLog,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminAccountRuntimeRoutes({
    app,
    provider,
    resolveAccountReference,
    canAccessAccount,
  });
  registerAdminFarmOperationRoutes({
    app,
    provider,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
  });
  registerAdminAnalyticsRoutes({ app });
  registerAdminSettingsRoutes({
    app,
    provider,
    store,
    logger: adminLogger,
    getAccountIdFromRequest,
    canAccessAccount,
    requireDangerConfirmation,
  });
  registerAdminSystemRoutes({
    app,
    store,
    logger: adminLogger,
    requireAdminToken,
    requireAdminRole,
    requireSuperAdminRole,
    requireDangerConfirmation,
    getDefaultSystemConfig,
    getRuntimeConfig,
    updateRuntimeConfig,
  });
  adminLogger.info("抓包服务默认关闭，未随管理面板启动运行");
  registerAdminCaptureRoutes({
    app,
    store,
    provider,
    userStore,
    logger: adminLogger,
    requireAdminRole,
    requireDangerConfirmation,
    canAccessAccount,
    resolveAccountReference,
    ensureEmbeddedCaptureService,
    stopEmbeddedCaptureService,
    updateRuntimeConfig,
  });
  registerAdminCurrentUserRoutes({
    app,
    requireAdminToken,
    requireAdminRole,
    userStore,
    store,
    getAccountsForUser,
  });
  registerAnnouncementRoutes({
    app,
    requireAdminToken,
    requireAdminRole,
    store,
  });
  // 登录页「账号续费」：未登录也能用「账号 + 卡密」给过期账号续费
  registerPublicRenewRoutes({ app });
  registerAdminAccountRoutes({
    app,
    provider,
    getIo: () => io,
    addOrUpdateAccount,
    deleteAccount,
    findAccountByRef,
    getAccountsForUser,
    getAccountIdFromRequest,
    resolveAccountReference,
    canAccessAccount,
    getAccessibleAccountIdsFromRequest,
    userStore,
    sendProviderError,
    store,
    updateRuntimeConfig,
  });
  registerAdminQrLoginRoutes({ app });
  registerAdminNapcatLoginRoutes({ app });
  registerAdminProxyRoutes({ app, logger: adminLogger });
  registerAdminYYBRoutes({ app, store });

  // ==================== 活动插件宿主 ====================
  // 顺序敏感：插件路由必须先于 SPA fallback 注册（ctx.route 会自动插到 '*' 之前，
  // 但启动恢复在这里完成可保证与手工注册的路由顺序一致）。
  const { createPluginHost } = require("../plugins/host");
  const {
    getAuthorizedAccountId: getAuthorizedPluginAccountId,
    requireConnectedAccount,
  } = require("./admin-activity-route-helpers");
  const pluginHost = createPluginHost({
    app,
    provider,
    requireAdminRole,
    getAuthorizedAccountId: getAuthorizedPluginAccountId,
    requireConnectedAccount,
    getAccountIdFromRequest,
    canAccessAccount,
    sendProviderError,
    log: (tag, msg, meta) =>
      (String(tag || "") === "错误" ? adminLogger.error : adminLogger.info)(
        String(msg || ""),
        { module: "plugin", tag, ...(meta || {}) },
      ),
  });

  // 插件静态资源（前端 ESM 产物 + 素材）。挂在 /api 之外，运行时新装插件
  // 无需重新挂载 —— 处理器每次请求查注册表。
  const { readRegistry } = require("../plugins/registry");
  const sendPluginFile = (res, rootDir, relative) => {
    const root = path.resolve(rootDir);
    // 允许请求路径重复携带 assets/ 前缀（前端既可能拼 "${assetPrefix}/x.png"，
    // 也可能拼 "${assetPrefix}/assets/x.png"），两种都解析到插件 assets 目录。
    const candidates = [relative];
    if (/^assets[\\/]/i.test(relative)) candidates.push(relative.replace(/^assets[\\/]/i, ""));
    else candidates.push(`assets/${relative}`);
    for (const candidate of candidates) {
      const target = path.resolve(root, candidate);
      if (!target.startsWith(root + path.sep)) continue;
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
      res.set("Cache-Control", "no-cache");
      res.set("X-Content-Type-Options", "nosniff");
      return res.sendFile(target);
    }
    return res.status(404).json({ ok: false, error: "Not Found" });
  };
  app.use("/plugins", (req, res) => {
    const parts = String(req.path || "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 3) return res.status(404).json({ ok: false, error: "Not Found" });
    const [pluginId, version, ...rest] = parts;
    const entry = readRegistry().plugins.find((item) => item.id === pluginId);
    if (!entry || String(entry.version) !== String(version)) {
      return res.status(404).json({ ok: false, error: "Not Found" });
    }
    return sendPluginFile(res, entry.dir, rest.join("/"));
  });
  app.use("/activity", (req, res, next) => {
    // 命中插件声明的 assetPrefix 时由插件目录提供素材；其余路径必须放行给后续
    // 中间件（web/dist 公共目录 / SPA fallback）——前端本身就有 /activity 路由，
    // 未命中插件时返回 404 会把活动页刷新变成 JSON 错误。
    const firstSegment = String(req.path || "").split("/").filter(Boolean)[0] || "";
    const entry = firstSegment
      ? readRegistry().plugins.find(
          (item) =>
            item.enabled === true &&
            item.manifest?.frontend?.assetPrefix === `/activity/${firstSegment}`,
        )
      : null;
    if (!entry) return next();
    const rest = String(req.path || "").slice(`/${firstSegment}/`.length);
    if (!rest) return next();
    return sendPluginFile(res, path.join(entry.dir, "assets"), rest);
  });

  pluginHost.restoreAll();
  const { registerAdminPluginRoutes } = require("./admin-plugin-routes");
  registerAdminPluginRoutes({
    app,
    pluginHost,
    provider,
    requireAdminRole,
    sendProviderError,
  });
  // 供 runtime-engine 把插件宿主注入 worker-manager（新 worker 启动时下发插件清单）
  startAdminServer.pluginHost = pluginHost;

  registerSpaFallback(app, webDist);

  const subscribeSocketToAccount = (socket, accountRef = "") => {
    const rawAccountRef = String(accountRef || "").trim();
    const accountId =
      rawAccountRef && rawAccountRef !== "all"
        ? resolveAccountReference(rawAccountRef)
        : "";
    const token = socket.data.adminToken;
    const session = token ? getAdminSession(token) : null;

    if (accountId && session && !isSuperAdminSession(session)) {
      const accounts = getAccountsForUser();
      const account = accounts.find((item) => item.id === accountId);
      if (!account || !isAccountOwner(account, session)) {
        socket.emit("subscribed", {
          accountId: "all",
          error: "无权访问此账号",
        });
        leaveAccountRooms(socket);
        socket.join("account:all");
        socket.data.accountId = "";
        return;
      }
    }

    leaveAccountRooms(socket);
    if (accountId) {
      socket.join(`account:${  accountId}`);
      socket.data.accountId = accountId;
    } else {
      socket.join("account:all");
      socket.data.accountId = "";
    }
    socket.emit("subscribed", {
      accountId: socket.data.accountId || "all",
    });

    try {
      const subscribedAccountId = socket.data.accountId || "";
      const socketUser = socket.data.user;
      if (
        subscribedAccountId &&
        provider &&
        typeof provider.getStatus === "function"
      ) {
        const status = provider.getStatus(subscribedAccountId);
        socket.emit("status:update", {
          accountId: subscribedAccountId,
          status,
        });
      }
      if (provider && typeof provider.getLogs === "function") {
        let logs = provider.getLogs(subscribedAccountId, {
          limit: LOG_SNAPSHOT_LIMIT,
        });
        if (!Array.isArray(logs)) logs = [];
        if (socketUser) {
          const accessibleAccountIds = getAccessibleAccountIdsForUser(socketUser);
          logs = logs.filter((logEntry) => {
            const logAccountId = logEntry.accountId || logEntry.id;
            if (!logAccountId) return true;
            return accessibleAccountIds.includes(logAccountId);
          });
        }
        socket.emit("logs:snapshot", {
          accountId: subscribedAccountId || "all",
          logs,
        });
      }
      if (provider && typeof provider.getAccountLogs === "function") {
        let accountLogs = provider.getAccountLogs(LOG_SNAPSHOT_LIMIT);
        if (!Array.isArray(accountLogs)) accountLogs = [];
        if (subscribedAccountId) {
          accountLogs = accountLogs.filter((logEntry) => {
            const logAccountId = String(logEntry.accountId || logEntry.id || "");
            return logAccountId === subscribedAccountId;
          });
        }
        if (socketUser) {
          const accessibleAccountIds = getAccessibleAccountIdsForUser(socketUser);
          accountLogs = accountLogs.filter((logEntry) => {
            const logAccountId = logEntry.accountId || logEntry.id;
            return accessibleAccountIds.includes(logAccountId);
          });
        }
        socket.emit("account-logs:snapshot", {
          logs: accountLogs,
        });
      }
    } catch {}
  };

  const adminPort = CONFIG.adminPort || 3007;
  server = app.listen(adminPort, "0.0.0.0", () => {
    adminLogger.info("admin panel started", {
      url: `http://localhost:${  adminPort}`,
      port: adminPort,
    });
  });
  configureHttpServerTimeouts(server);
  trackHttpConnections(server);

  io = new SocketIOServer(server, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    pingInterval: 20000,
    pingTimeout: 10000,
    connectTimeout: 10000,
    maxHttpBufferSize: 256 * 1024,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["x-admin-token", "x-account-id"],
    },
  });
  io.use((socket, next) => {
    const token = getSocketHandshakeToken(socket);
    if (!token || !hasAdminToken(token)) {
      return next(new Error("Unauthorized"));
    }
    socket.data.adminToken = token;
    socket.data.user = getAdminSession(token);
    return next();
  });
  io.on("connection", (socket) => {
    const initialAccountId =
      (socket.handshake.auth && socket.handshake.auth.accountId) ||
      (socket.handshake.query && socket.handshake.query.accountId) ||
      "";
    subscribeSocketToAccount(socket, initialAccountId);
    socket.emit("ready", { ok: true, ts: Date.now() });
    socket.on("subscribe", (payload) => {
      const safePayload = payload && typeof payload === "object" ? payload : {};
      subscribeSocketToAccount(socket, safePayload.accountId || "");
    });
  });
}

module.exports = {
  startAdminServer,
  emitRealtimeStatus,
  emitRealtimeLog,
  emitRealtimeAccountLog,
};
