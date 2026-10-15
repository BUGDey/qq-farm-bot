/**
 * YYB服务代理路由
 * 用于代理前端对YYB服务的请求，解决CORS跨域问题
 */

const axios = require('axios');

/**
 * 注册YYB相关的API路由
 * @param {Object} options
 * @param {Express} options.app - Express应用实例
 * @param {Object} options.store - Store实例
 */
function registerAdminYYBRoutes({ app, store }) {
  /**
   * YYB代码获取接口
   * POST /api/yyb/getCode
   * Body: { app_id: string, ref: string }
   * Returns: { ok: true, data: { code: string, openid?: string } }
   */
  app.post('/api/yyb/getCode', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      
      // 验证必需参数
      if (!body.app_id || !body.ref) {
        return res.status(400).json({
          ok: false,
          error: '缺少必需参数 app_id 或 ref',
        });
      }

      // 从配置读取YYB服务配置
      const yybConfig = store.getYYBConfig ? store.getYYBConfig() : {};
      const YYB_URL = yybConfig.url;
      const YYB_TOKEN = yybConfig.token;

      if (!YYB_URL || !YYB_TOKEN) {
        return res.status(500).json({
          ok: false,
          error: 'YYB服务地址或Token未配置，请在设置中配置YY-GO',
        });
      }

      // 发起代理请求
      console.log('[YYB代理] 准备请求:', {
        url: YYB_URL,
        params: { app_id: body.app_id, ref: body.ref },
        hasToken: !!YYB_TOKEN,
        tokenPrefix: YYB_TOKEN ? YYB_TOKEN.substring(0, 8) + '...' : 'N/A'
      });

      const response = await axios.post(
        YYB_URL,
        {
          app_id: body.app_id,
          ref: body.ref,
        },
        {
          headers: {
            'Authorization': `Bearer ${YYB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      console.log('[YYB代理] 收到响应:', {
        status: response.status,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : []
      });

      // 验证响应数据
      if (!response.data) {
        return res.status(500).json({
          ok: false,
          error: 'YYB服务响应为空',
        });
      }

      // 检查业务状态码
      if (response.data.code !== 0) {
        return res.status(400).json({
          ok: false,
          error: response.data.msg || response.data.error || response.data.message || 'YYB服务返回错误',
        });
      }

      // 提取code值
      const code = response.data.data?.result?.code;
      if (!code) {
        return res.status(400).json({
          ok: false,
          error: response.data.data?.result?.errMsg || response.data.msg || 'YYB服务未返回有效的code',
        });
      }

      // 返回成功响应
      res.json({
        ok: true,
        data: {
          code,
          openid: response.data.data?.openid,
        },
      });
    } catch (error) {
      // 统一错误处理
      if (error.response) {
        // HTTP错误响应
        const status = error.response.status;
        const message = error.response.data?.error
          || error.response.data?.message
          || error.message;

        res.status(status).json({
          ok: false,
          error: `YYB服务请求失败: ${message}`,
        });
      } else if (error.request) {
        // 请求已发送但无响应
        res.status(503).json({
          ok: false,
          error: 'YYB服务无响应，请检查网络连接',
        });
      } else {
        // 其他错误
        res.status(500).json({
          ok: false,
          error: error.message || 'YYB服务请求失败',
        });
      }
    }
  });
}

module.exports = { registerAdminYYBRoutes };
