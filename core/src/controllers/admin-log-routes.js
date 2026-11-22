const logger = require("../services/logger");

/**
 * 管理后台「系统日志」接口：返回最近的控制台/落盘日志行。
 * Windows 下读的是 combined 日志（与命令行面板输出一致），Linux/Docker 下同样是容器日志。
 */
function registerAdminLogRoutes({ app, requireAdminRole, sendProviderError }) {
  const adminOnly = typeof requireAdminRole === "function"
    ? requireAdminRole
    : (req, res, next) => next();

  app.get("/api/admin/logs/recent", adminOnly, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 300;
      const { lines, logDir } = logger.readRecentLogLines(limit);
      res.json({
        ok: true,
        data: {
          lines,
          logDir,
          platform: process.platform,
          generatedAt: Date.now(),
        },
      });
    } catch (error) {
      if (typeof sendProviderError === "function") {
        sendProviderError(res, error);
      } else {
        res.status(500).json({ ok: false, error: error.message });
      }
    }
  });
}

module.exports = { registerAdminLogRoutes };