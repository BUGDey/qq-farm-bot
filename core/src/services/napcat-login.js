const crypto = require('node:crypto');
const fs = require('node:fs');
const QRCode = require('qrcode');

const APP_ID = '1112386029';
const TTL_MS = Math.max(30000, Number(process.env.NAPCAT_LOGIN_TTL_MS) || 120000);
const tasks = new Map();
let activeTaskId = '';
let webUiCredential = '';

function trimUrl(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function authToken() {
  const tokenFile = process.env.NAPCAT_TOKEN_FILE || '/app/napcat-auth/token';
  try { return fs.readFileSync(tokenFile, 'utf8').trim(); } catch { return String(process.env.NAPCAT_TOKEN || '').trim(); }
}

/**
 * 扫码插件的 Token 未必等于 WebUI Token：
 * 插件装在 NapCat 里以后，任何人都可能用 NapCat 的插件市场重装它并生成新 Token。
 * 所以优先读「插件自己的配置」，读不到才退回 WebUI Token（启动器首次安装时两者相同）。
 */
function pluginToken() {
  const direct = String(process.env.NAPCAT_PLUGIN_TOKEN || '').trim();
  if (direct) return direct;
  const configFile = String(process.env.NAPCAT_PLUGIN_TOKEN_FILE || '').trim();
  if (configFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const token = String(parsed?.token || '').trim();
      if (token) return token;
    } catch {}
  }
  return authToken();
}

function config() {
  const token = authToken();
  return {
    webui: trimUrl(process.env.NAPCAT_WEBUI_URL || 'http://napcat:6099/api'),
    webuiToken: token,
    plugin: trimUrl(process.env.NAPCAT_OPENAUTH_URL || 'http://napcat:6099/plugin/qq-miniapp-openauth/api'),
    pluginToken: pluginToken(),
  };
}

/** 启动器是否选了「2) QQ 扫码版」——只代表开关，不代表 Token 已经就绪 */
function launchEnabled() {
  return /^(?:1|true|yes|on)$/i.test(String(process.env.NAPCAT_LOGIN_ENABLED || ''));
}

function isConfigured() {
  const cfg = config();
  return launchEnabled() && Boolean(cfg.webui && cfg.webuiToken && cfg.plugin && cfg.pluginToken);
}

/**
 * 面板用来决定「要不要显示 QQ 扫码页签」以及「显示二维码还是问题说明」。
 *
 * - launchEnabled：启动器选了扫码版 → 页签显示（此时可能还没拿到 Token）
 * - enabled：Token 与地址都齐 → 可以直接出二维码
 * - reasons：没就绪时逐条说明缺什么，避免前端只能显示一句「未检测到」
 */
function capability() {
  const cfg = config();
  const tokenPath = process.env.NAPCAT_TOKEN_FILE || '/app/napcat-auth/token';
  const reasons = [];
  if (!launchEnabled()) reasons.push('当前不是扫码版启动：请用 start.bat 选「2) 启动 QQ 扫码版」');
  if (!cfg.webuiToken) reasons.push(`没有读到 NapCat Token（${tokenPath} 不存在或为空），请让启动器重新生成`);
  if (!cfg.webui) reasons.push('NAPCAT_WEBUI_URL 为空，启动器没有写入 WebUI 地址');
  if (!cfg.plugin) reasons.push('NAPCAT_OPENAUTH_URL 为空，启动器没有写入扫码插件地址');
  return {
    launchEnabled: launchEnabled(),
    enabled: reasons.length === 0,
    hasToken: Boolean(cfg.webuiToken),
    tokenPath,
    webui: cfg.webui,
    reasons,
  };
}

async function requestJson(url, { method = 'POST', body, token = '', timeout = 15000 } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new Error(`无法连接 NapCat: ${error.message}`);
  }
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(payload.error || payload.message || `NapCat HTTP ${response.status}`);
  return payload;
}

function normalize(value) {
  if (!value || typeof value !== 'object') return value;
  return { ...value, ...(value.data || {}), ...(value.result || {}), ...(value.data?.result || {}) };
}

function isAuthError(error) {
  return /unauthorized|credential|凭证|认证|登录失败|401/i.test(String(error?.message || ''));
}

async function webUiLogin() {
  const cfg = config();
  webUiCredential = '';
  if (!cfg.webuiToken) throw new Error('NapCat WebUI 登录失败，请检查 Token 或关闭 2FA');
  const hash = crypto.createHash('sha256').update(`${cfg.webuiToken}.napcat`).digest('hex');
  const login = await requestJson(`${cfg.webui}/auth/login`, { body: { hash } });
  webUiCredential = login?.data?.Credential || '';
  if (!webUiCredential) throw new Error('NapCat WebUI 登录失败，请检查 Token 或关闭 2FA');
  return webUiCredential;
}

/**
 * 调 NapCat WebUI 接口。
 *
 * NapCat 在 QQ 登录/注销、RestartNapCat 之后会让旧的 Credential 失效，
 * 而它返回的是 HTTP 200 + `{code:-1,message:"Unauthorized"}`，
 * 所以这里遇到鉴权失败要重新登录并重试一次，否则用户看到的就是一句英文 Unauthorized。
 */
async function webUi(action, body = {}) {
  const cfg = config();
  if (!webUiCredential) await webUiLogin();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await requestJson(`${cfg.webui}${action}`, { body, token: webUiCredential });
      if (payload.code !== undefined && Number(payload.code) !== 0) throw new Error(payload.message || 'NapCat WebUI 请求失败');
      return normalize(payload);
    } catch (error) {
      if (attempt === 0 && isAuthError(error)) {
        await webUiLogin();
        continue;
      }
      if (isAuthError(error)) throw new Error('NapCat WebUI 鉴权失败：Token 与 NapCat 实际配置不一致，请重新运行启动器（选 2）后再试');
      throw error;
    }
  }
  throw new Error('NapCat WebUI 请求失败');
}

/** 调扫码插件（qq-miniapp-openauth），鉴权失败时给出人话提示 */
async function pluginRequest(action, { method = 'GET', body, timeout = 15000 } = {}) {
  const cfg = config();
  try {
    return await requestJson(`${cfg.plugin}${action}`, { method, body, token: cfg.pluginToken, timeout });
  } catch (error) {
    if (isAuthError(error)) throw new Error('扫码插件鉴权失败：插件 Token 与面板不一致，请重新运行启动器（选 2）后再试');
    throw error;
  }
}

function taskPublic(task) {
  return { taskId: task.id, status: task.status, qrImage: task.qrImage || '', expiresAt: task.expiresAt, error: task.error || '' };
}
function profile(value) {
  const user = normalize(value) || {};
  return {
    uin: String(user.uin || user.user_id || user.qq || '').trim(),
    nickname: String(user.nickname || user.nick || user.name || '').trim(),
  };
}
function ownedTask(id, owner) {
  const task = tasks.get(String(id || ''));
  if (!task || task.owner !== owner) throw new Error('登录任务不存在或已过期');
  return task;
}

function hasQqSession(state) {
  return state?.isLogin === true || state?.isOffline === true;
}

async function logout() {
  // Prevent the persisted QQ session from being restored when NapCat restarts.
  await webUi('/QQLogin/SetQuickLoginQQ', { uin: '' }).catch(() => {});
  const payload = await pluginRequest('/logout', { method: 'POST' });
  if (payload.ok !== true || payload.loggedOut !== true) throw new Error(payload.error || 'NapCat 注销失败');
  await new Promise(resolve => setTimeout(resolve, 250));
  try {
    const state = await webUi('/QQLogin/CheckLoginStatus');
    if (!hasQqSession(state)) return;
  } catch {}
  await resetNapcat();
}

async function resetNapcat() {
  await webUi('/QQLogin/RestartNapCat');
  // 重启后旧的 Credential 一定失效，先清掉，下一轮请求会重新登录
  webUiCredential = '';
  for (let i = 0; i < 24; i += 1) {
    await new Promise(resolve => setTimeout(resolve, i ? 250 : 1000));
    try {
      const state = await webUi('/QQLogin/CheckLoginStatus');
      if (!hasQqSession(state)) return;
    } catch {}
  }
  throw new Error('NapCat 重启后仍未确认退出登录');
}

async function clearStaleSession() {
  try {
    const state = await webUi('/QQLogin/CheckLoginStatus');
    if (hasQqSession(state)) await logout();
  } catch (error) {
    if (!/QQ Is Logined/i.test(error.message)) return;
    await logout();
  }
}

async function release(task, cleanup = '') {
  if (task.timer) clearTimeout(task.timer);
  if (cleanup === 'logout') await logout();
  else if (cleanup === 'restart') await resetNapcat();
  tasks.delete(task.id);
  if (activeTaskId === task.id) activeTaskId = '';
}

async function create(owner, { refresh = false } = {}) {
  if (!isConfigured()) throw new Error('NapCat 扫码登录未配置');
  const current = tasks.get(activeTaskId);
  if (current && current.expiresAt > Date.now()) {
    if (current.owner !== owner) throw new Error('已有 QQ 扫码任务正在进行，请稍后再试');
    if (current.status === 'cleaning') throw new Error('上一账号正在清理 QQ 会话，请稍候');
    if (current.status === 'cleanup_failed') await release(current, 'restart');
    else return taskPublic(current);
  } else if (current) {
    await release(current, current.status === 'confirmed' ? 'logout' : '').catch(() => {});
  }
  await clearStaleSession();
  if (refresh) {
    await webUi('/QQLogin/RefreshQRcode');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  let result;
  try {
    result = await webUi('/QQLogin/GetQQLoginQrcode');
  } catch (error) {
    if (/QQ Is Logined/i.test(error.message)) {
      await logout();
    } else if (refresh) throw error;
    await webUi('/QQLogin/RefreshQRcode');
    await new Promise(resolve => setTimeout(resolve, 300));
    result = await webUi('/QQLogin/GetQQLoginQrcode');
  }
  const raw = result.qrcode || result.qrCode || result.qrUrl || result.qr_url || result.image || result.base64;
  if (!raw) throw new Error('NapCat 未返回登录二维码');
  const qrImage = /^data:image\//i.test(raw) ? raw : (/^[a-z0-9+/]+={0,2}$/i.test(raw) && raw.length > 128 ? `data:image/png;base64,${raw}` : await QRCode.toDataURL(raw, { width: 280, margin: 1 }));
  const task = { id: crypto.randomBytes(18).toString('hex'), owner, status: 'waiting_scan', qrImage, expiresAt: Date.now() + TTL_MS };
  task.timer = setTimeout(() => { void release(task, task.status === 'confirmed' ? 'logout' : '').catch(() => {}); }, TTL_MS + 10);
  task.timer.unref?.();
  tasks.set(task.id, task);
  activeTaskId = task.id;
  return taskPublic(task);
}

async function status(id, owner) {
  const task = ownedTask(id, owner);
  if (task.result) return taskPublic(task);
  if (task.expiresAt <= Date.now()) { await release(task, task.status === 'confirmed' ? 'logout' : '').catch(() => {}); throw new Error('登录任务已过期'); }
  const state = await webUi('/QQLogin/CheckLoginStatus');
  const text = `${state.status || ''} ${state.message || ''}`.toLowerCase();
  if (state.isLogin === true) {
    try {
      const user = profile(await webUi('/QQLogin/GetQQLoginInfo'));
      if (user.uin) {
        task.user = user;
        task.status = 'confirmed';
      }
    } catch {}
  } else if (/scanned|待确认|等待确认/.test(text)) task.status = 'scanned';
  else if (/expired|timeout|过期|失效/.test(text)) task.status = 'expired';
  return taskPublic(task);
}

async function code(id, owner) {
  const task = ownedTask(id, owner);
  if (task.result) return task.result;
  if (task.status !== 'confirmed') throw new Error('请先完成 QQ 扫码确认');
  if (!task.codePromise) {
    task.codePromise = (async () => {
      let ready = false;
      for (let i = 0; i < 40; i += 1) {
        try {
          const health = await pluginRequest('/status', { method: 'GET', timeout: 5000 });
          if (health.ok === true && health.ready === true) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!ready) throw new Error('QQ 已确认登录，但 NapCat 上下文尚未就绪，请稍后重试');
      const result = await pluginRequest('/miniapp', { method: 'POST', body: { appId: APP_ID, interactive: true }, timeout: TTL_MS });
      const authCode = String(result.code || (result.operation === 'loginWithAppId' ? result.result : '') || '').trim();
      if (!result.ok || !authCode) throw new Error(result.error || 'NapCat 未返回小程序授权 Code');
      const identity = {
        uin: String(result.uin || task.user?.uin || '').trim(),
        nickname: String(result.nickname || task.user?.nickname || '').trim(),
      };
      task.result = { code: authCode, ...identity };
      task.status = 'cleaning';
      if (task.timer) clearTimeout(task.timer);
      task.cleanupPromise = logout()
        .then(() => release(task))
        .catch((error) => {
          task.status = 'cleanup_failed';
          task.error = error.message;
          task.expiresAt = Date.now() + TTL_MS;
          task.timer = setTimeout(() => { void release(task, 'restart').catch(() => {}); }, TTL_MS);
          task.timer.unref?.();
        });
      return task.result;
    })().catch(error => { task.error = error.message; task.codePromise = null; throw error; });
  }
  return task.codePromise;
}

async function cancel(id, owner) {
  const task = tasks.get(String(id || ''));
  if (!task) return;
  if (task.owner !== owner) throw new Error('无权取消此登录任务');
  await release(task, task.status === 'confirmed' ? 'logout' : task.status === 'scanned' ? 'restart' : '');
}

module.exports = { APP_ID, isConfigured, launchEnabled, capability, pluginToken, create, status, code, cancel };
