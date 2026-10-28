/**
 * 活动插件 manifest.json 校验与归一化。
 *
 * manifest 是插件的唯一契约：活动时间窗、自动化开关（key/类型/默认值/时间窗），
 * 卡片素材路径、前后端入口都由它声明，宿主据此注册，不再有前后端双写字面量。
 */

const PLUGIN_API_VERSION = 1;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const AUTOMATION_KEY_PATTERN = /^\w{2,64}$/;
const WINDOW_KEY_PATTERN = /^[\w-]{1,32}$/;
const ASSET_PREFIX_PATTERN = /^\/[\w/-]+$/;
const VERSION_PATTERN = /^\d{1,3}(?:\.\d{1,3}){2}$/;
const AUTOMATION_TYPES = new Set(['boolean', 'select', 'number']);
const MAX_AUTOMATION_KEYS = 64;
const MAX_WINDOWS = 8;

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSeconds(value) {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}

function normalizeAutomationSpec(raw) {
    if (!isPlainObject(raw)) return { error: 'automation 条目必须是对象' };
    const key = String(raw.key || '');
    if (!AUTOMATION_KEY_PATTERN.test(key)) return { error: `automation key 非法：${key}（仅允许小写字母/数字/下划线，2-64 位）` };
    const type = AUTOMATION_TYPES.has(raw.type) ? raw.type : 'boolean';
    const spec = {
        key,
        type,
        label: String(raw.label || key).slice(0, 60),
        detail: String(raw.detail || '').slice(0, 200),
    };
    if (raw.window !== undefined) spec.window = String(raw.window || '');
    if (type === 'boolean') {
        spec.default = raw.default === true;
    } else if (type === 'select') {
        const options = Array.isArray(raw.options) ? raw.options : [];
        if (!options.length) return { error: `select 类型开关 ${key} 必须提供 options` };
        const normalizedOptions = [];
        for (const option of options.slice(0, 32)) {
            if (!isPlainObject(option)) return { error: `select 开关 ${key} 的 options 条目必须是对象` };
            normalizedOptions.push({
                value: Number(option.value),
                label: String(option.label ?? option.value).slice(0, 60),
            });
        }
        if (normalizedOptions.some(option => !Number.isFinite(option.value))) {
            return { error: `select 开关 ${key} 的 options.value 必须是数字` };
        }
        spec.options = normalizedOptions;
        const defaultValue = Number(raw.default);
        spec.default = normalizedOptions.some(option => option.value === defaultValue)
            ? defaultValue
            : normalizedOptions[0].value;
    } else {
        const num = Number(raw.default);
        if (!Number.isFinite(num)) return { error: `number 类型开关 ${key} 必须提供数字 default` };
        spec.default = num;
        spec.min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : undefined;
        spec.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : undefined;
    }
    return { spec };
}

/**
 * 校验并归一化 manifest；失败返回 { error }，成功返回 { manifest }。
 */
function validateManifest(raw) {
    if (!isPlainObject(raw)) return { error: 'manifest.json 必须是 JSON 对象' };
    if (raw.apiVersion !== PLUGIN_API_VERSION) {
        return { error: `apiVersion 不兼容：插件 ${JSON.stringify(raw.apiVersion)}，宿主 ${PLUGIN_API_VERSION}` };
    }
    const id = String(raw.id || '');
    if (!SLUG_PATTERN.test(id)) return { error: `插件 id 非法：${id}（小写字母/数字/中划线/下划线，2-64 位）` };
    const name = String(raw.name || '').trim();
    if (!name || name.length > 40) return { error: '插件 name 必填且不超过 40 字' };
    const version = String(raw.version || '').trim();
    if (!VERSION_PATTERN.test(version)) return { error: `插件版本号非法：${version}（需为 x.y.z）` };

    const windows = {};
    const rawWindows = Array.isArray(raw.windows) ? raw.windows : [];
    if (!rawWindows.length) return { error: 'manifest 必须声明至少一个时间窗（windows）' };
    if (rawWindows.length > MAX_WINDOWS) return { error: `windows 数量超过上限 ${MAX_WINDOWS}` };
    for (const item of rawWindows) {
        if (!isPlainObject(item)) return { error: 'windows 条目必须是对象' };
        const key = String(item.key || '');
        if (!WINDOW_KEY_PATTERN.test(key)) return { error: `时间窗 key 非法：${key}` };
        const startTime = normalizeSeconds(item.startTime);
        const endTime = normalizeSeconds(item.endTime);
        // startTime=0 且 endTime=0 表示常驻（不限时间）；否则两者必须为有效秒级时间戳
        const permanent = startTime === 0 && endTime === 0;
        if (!permanent && (!startTime || !endTime || endTime < startTime)) {
            return { error: `时间窗 ${key} 的 startTime/endTime 无效（秒级时间戳，endTime 不得早于 startTime；0/0 表示常驻）` };
        }
        windows[key] = { startTime, endTime, permanent };
    }

    const automation = [];
    const rawAutomation = Array.isArray(raw.automation) ? raw.automation : [];
    if (rawAutomation.length > MAX_AUTOMATION_KEYS) return { error: `automation 数量超过上限 ${MAX_AUTOMATION_KEYS}` };
    const automationKeys = new Set();
    for (const item of rawAutomation) {
        const { spec, error } = normalizeAutomationSpec(item);
        if (error) return { error: `manifest.automation：${error}` };
        if (automationKeys.has(spec.key)) return { error: `automation key 重复：${spec.key}` };
        if (spec.window && !windows[spec.window]) return { error: `开关 ${spec.key} 引用了未声明的时间窗：${spec.window}` };
        automationKeys.add(spec.key);
        automation.push(spec);
    }

    // frontend 可选：纯素材/配置型插件（无活动面板）可不声明前端
    const frontend = isPlainObject(raw.frontend) ? raw.frontend : {};
    if (frontend.entry && !String(frontend.entry).endsWith('.mjs')) {
        return { error: 'frontend.entry 必须是插件包内的 .mjs 文件路径' };
    }
    const assetPrefix = String(frontend.assetPrefix || '').trim();
    if (assetPrefix && !ASSET_PREFIX_PATTERN.test(assetPrefix)) {
        return { error: `frontend.assetPrefix 非法：${assetPrefix}（需为以 / 开头的站内路径）` };
    }

    // gameConfig 可选：声明本插件提供植物/种子/阶段图等素材。
    // 宿主会把安装目录下的 catalog/EventPlants.json、catalog/ItemInfo.json、
    // assets/seed_images_named/、assets/plant_images/manifest.json 合并进核心配置。
    const gameConfig = isPlainObject(raw.gameConfig) ? raw.gameConfig : null;
    if (gameConfig) {
        if (gameConfig.provides !== true) return { error: 'gameConfig.provides 必须为 true 或省略' };
        const rawPrefix = String(gameConfig.urlPrefix || '').trim();
        if (rawPrefix && !ASSET_PREFIX_PATTERN.test(rawPrefix)) {
            return { error: `gameConfig.urlPrefix 非法：${rawPrefix}` };
        }
    }

    const manifest = {
        id,
        name,
        version,
        apiVersion: PLUGIN_API_VERSION,
        description: String(raw.description || '').slice(0, 120),
        activityIds: Array.isArray(raw.activityIds) ? raw.activityIds.map(Number).filter(Number.isSafeInteger) : [],
        windows,
        automation,
        frontend: {
            entry: frontend.entry ? String(frontend.entry) : '',
            css: frontend.css ? String(frontend.css) : '',
            assetPrefix: assetPrefix || '',
        },
        gameConfig: gameConfig ? {
            provides: true,
            urlPrefix: String(gameConfig.urlPrefix || '').trim() || '/game-config',
        } : null,
        card: {
            icon: String(raw.card?.icon || 'i-carbon-calendar').slice(0, 60),
            image: String(raw.card?.image || '').slice(0, 200),
            updatedMs: (() => {
                const num = Number(raw.card?.updatedMs);
                return Number.isFinite(num) && num >= 0 ? Math.floor(num) : windows[Object.keys(windows)[0]].startTime * 1000;
            })(),
        },
    };
    return { manifest };
}

module.exports = { PLUGIN_API_VERSION, validateManifest };
