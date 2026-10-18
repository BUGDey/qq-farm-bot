#!/usr/bin/env node

/**
 * 从官方 CDN 配置表增量同步 Plant.json / ItemInfo.json
 *
 * 背景：仓库里的两张表是官方 delayRes 配置表的忠实子集（字段、取值、顺序都与官方一致），
 * 用于在土地/图鉴/仓库里把裸 ID 解析成名称与图片。官方每次活动更新都会往表里加新
 * 植物与物品，不同步就会出现「植物xxxxx」「果实xxxxx」和图标缺失。
 *
 * 合并策略（与 scripts/merge-upstream-iteminfo.mjs 同一套安全原则）：
 *   1. 只新增本地缺失的条目，绝不改动存量条目的任何字段。
 *      以上游为基底整体替换会改变 621 个既有条目的 level/name/sells，把活动作物等级
 *      从 1 改成 200，导致种植自动化拒绝种植活动作物。
 *   2. 不新增 type=5（种子）与 type=6（果实）行。
 *      种子会让 getSeedLevel 从「返回 0 走 land_level_need 兜底」变成「返回官方 level」，
 *      改变种植解锁判定；果实携带 level，会改变图鉴/仓库的展示值。
 *      这两类需要人工评估后单独加（例如黄金变体果实只影响展示、不涉及种子等级）。
 *   3. 不新增 InvalidPlants.json 黑名单里的植物/种子（已知异常白萝卜 2020002/29999）。
 *   4. 不新增已被 EventPlants.json 覆盖的植物（按植物 ID 或种子 ID 判断），
 *      避免 Plant.json 抢先匹配把 EventPlants 的 planting_priority 等信息屏蔽掉。
 *   5. 落盘前做两层校验：既有条目逐字段不变（不变量）、新增条目不得是本地 Plant.json
 *      的种子 ID（派生守卫）。
 *
 * 排序/落盘策略（按各表既有的本地形态选择，保证 diff 最小、存量字节不动）：
 *   - ItemInfo.json：本地是「id 升序主干 + 少量插错位置的活动补丁 + 尾部紧凑单行块」
 *     的混合形态。合并时按字节级定点插入：新条目以匹配邻居风格的独立块，插到文件中
 *     第一个「id 更大且位置正确」的元素之前，既有字节一律不动。
 *     整体按 id 重排+重新缩进会产生上万行无意义 diff（尾部 69 条紧凑条目会被展开），
 *     与项目「不提交无意义 diff」的约定相悖，因此不做。
 *   - Plant.json：本地严格跟随官方表序（官方序断点仅 2 处），新增条目按官方表序插到
 *     最近的前序本地条目之后，整体按 2 空格缩进落盘（该文件本就是标准多行格式）。
 *
 * 用法：
 *   node core/scripts/sync-config-tables.js                 # dry-run，只打印报告
 *   node core/scripts/sync-config-tables.js --write         # 落盘
 *   node core/scripts/sync-config-tables.js --source <目录>  # 指定已解包的官方源码目录
 *   node core/scripts/sync-config-tables.js --refresh       # 忽略 CDN 缓存重新拉取
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  bundleConfigUrl,
  cacheKey,
  parseConfigRows,
  remoteBundleNames,
  tableNameFromAssetPath,
  findSettingsFile,
} = require('../src/services/cdn-resource-finder');
const { findLatestSource } = require('../src/services/activity-update-scanner');
const { isInvalidPlant, isInvalidSeedId } = require('../src/config/invalidPlants');

const APP_ID = '1112386029';
const CORE_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(CORE_ROOT, 'src', 'gameConfig');

// 需要同步的表：官方资源名 -> 本地文件
const TABLES = [
  { official: 'Plant', file: 'Plant.json' },
  { official: 'ItemInfo', file: 'ItemInfo.json' },
];

// 除「本地已覆盖的 type」外，额外允许同步的 type（机器人确实消费的功能物品）
const EXTRA_ITEM_TYPES = new Set([23, 24, 28]);

function usage() {
  return `官方 CDN 配置表增量同步工具

用法：
  node core/scripts/sync-config-tables.js                  dry-run，只打印报告
  node core/scripts/sync-config-tables.js --write          落盘
  node core/scripts/sync-config-tables.js --source <目录>   指定官方源码目录
  node core/scripts/sync-config-tables.js --refresh        重新拉取 CDN 配置
`;
}

function parseArgs(argv) {
  const result = { write: false, refresh: false, source: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') result.help = true;
    else if (token === '--write') result.write = true;
    else if (token === '--refresh') result.refresh = true;
    else if (token === '--source') result.source = argv[++index] || '';
    else throw new Error(`未知参数：${token}`);
  }
  return result;
}

function candidateSourceRoots() {
  const roots = [];
  if (process.platform === 'win32') {
    roots.push(path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'QQEX', 'miniapp', 'temps', 'miniapp_src'));
  }
  roots.push(path.join(os.homedir(), 'Library', 'Containers', 'com.tencent.qqexminiprogram',
    'Data', 'Library', 'Application Support', 'QQEX', 'miniapp', 'temps', 'miniapp_src'));
  return roots;
}

function resolveSource(explicit) {
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!fs.existsSync(resolved)) throw new Error(`源码目录不存在：${resolved}`);
    return resolved;
  }
  for (const root of candidateSourceRoots()) {
    const { latest } = findLatestSource(root);
    if (latest) return latest.directory;
  }
  throw new Error('未找到官方小游戏源码目录，请用 --source 指定已解包目录');
}

async function download(url, target, refresh) {
  if (!refresh && fs.existsSync(target)) return;
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`下载失败 ${response.status}：${url}`);
  const temporary = `${target}.building-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temporary, target);
}

async function readRemoteJson(url, target, refresh) {
  await download(url, target, refresh);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

/**
 * 拉取官方 bundle 下的全部配置表（与 find-cdn-resource.js 共用缓存目录）
 */
async function loadOfficialTables(settings, cacheRoot, refresh) {
  const versionRoot = path.join(cacheRoot, cacheKey(settings));
  const tables = new Map();
  for (const bundle of remoteBundleNames(settings)) {
    const config = await readRemoteJson(bundleConfigUrl(settings, bundle),
      path.join(versionRoot, 'bundles', `${bundle}.json`), refresh);
    for (const [indexText, value] of Object.entries(config.paths || {})) {
      const assetPath = value?.[0];
      if (!String(assetPath || '').startsWith('config/')) continue;
      const name = tableNameFromAssetPath(assetPath);
      if (!TABLES.some(table => table.official === name)) continue;
      const uuid = String(config.uuids?.[Number(indexText)] || '');
      const hash = (config.versions?.import || [])[(config.versions.import.indexOf(Number(indexText)) + 1) || -1];
      if (!uuid || !hash) continue;
      const url = `${settings.assets.server.replace(/\/$/, '')}/remote/${bundle}/import/${uuid.slice(0, 2)}/${uuid}.${hash}.json`;
      const safeName = String(assetPath).replace(/[^\w.-]/g, '_');
      const serialized = await readRemoteJson(url,
        path.join(versionRoot, 'tables', `${bundle}_${safeName}.json`), refresh);
      const rows = parseConfigRows(serialized);
      if (rows) tables.set(name, rows);
    }
  }
  return tables;
}

function readLocalArray(file) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8'));
}

function readEventPlants() {
  const file = path.join(CONFIG_DIR, 'EventPlants.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * ItemInfo.json 合并：文本级定点插入。
 *
 * 本地文件不是标准序列化产物：主干按 id 升序，但历史上活动补丁把少量条目插到了错误
 * 位置（相邻逆序），尾部还有一整块紧凑单行条目（且混着两种分隔符风格）。因此不能
 * 整体重新序列化——那会把 69 条紧凑条目展开成多行、并把插错的条目归位，产生上万行
 * 与数据无关的 diff。
 *
 * 做法：把原文本拆成「前缀 + 顶层元素 + 元素间隔 + 结尾」，原有字节全部保留；
 * 每条新条目以匹配邻居风格的独立块，插到「第一个 id 更大且不在逆序对里的元素」之前
 * （即 id 升序主干上的正确位置），间隔统一用 ",\n  "。追加到末尾时让原末尾元素让出
 * 标准分隔、新条目接管原末尾间隔。
 */
const ITEM_GAP = ',\n  ';

/** 字符串/转义感知地把 JSON 数组文本拆成元素区间，间隔原样保留 */
function splitJsonArrayText(raw) {
  let index = 0;
  while (index < raw.length && raw[index] !== '[') index += 1;
  if (index >= raw.length) throw new Error('不是 JSON 数组文本');
  const prefix = raw.slice(0, index + 1);
  index += 1;
  const elements = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;
  for (; index < raw.length; index += 1) {
    const ch = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        elements.push({ start, end: index + 1 });
        start = -1;
      }
      continue;
    }
    if (ch === ']' && depth === 0) break;
  }
  if (depth !== 0 || start >= 0) throw new Error('JSON 数组元素配平失败');
  const tailStart = index;
  const lead = elements.length ? raw.slice(prefix.length, elements[0].start) : raw.slice(prefix.length, tailStart);
  const gaps = elements.map((element, i) => raw.slice(element.end,
    i + 1 < elements.length ? elements[i + 1].start : tailStart));
  return { raw, prefix, lead, elements, gaps, tail: raw.slice(tailStart) };
}

/** 相邻逆序对中较大一侧的下标——这些是活动补丁插错位置的条目，不当锚点 */
function findMisplacedIndices(ids) {
  const misplaced = new Set();
  for (let i = 0; i < ids.length - 1; i += 1) {
    if (ids[i] > ids[i + 1]) misplaced.add(i);
  }
  return misplaced;
}

function detectEntryStyle(raw, element) {
  if (!element) return 'pretty';
  const text = raw.slice(element.start, element.end);
  if (!text.includes('\n')) return text.includes('": ') ? 'compact-spaced' : 'compact';
  return 'pretty';
}

/** 按文件既有风格序列化新条目：首行缩进由前序文本提供，后续行 +2 空格 */
function serializeItemEntry(row, style) {
  if (style === 'pretty') {
    return JSON.stringify(row, null, 2).replace(/\n/g, '\n  ');
  }
  if (style === 'compact-spaced') {
    return `{${Object.entries(row).map(([key, value]) => `"${key}": ${JSON.stringify(value)}`).join(', ')}}`;
  }
  return JSON.stringify(row);
}

function planItemInsertions(raw, plannedRows) {
  const parsed = splitJsonArrayText(raw);
  const ids = parsed.elements.map(element => Number(JSON.parse(raw.slice(element.start, element.end)).id));
  const misplaced = findMisplacedIndices(ids);
  const insertions = [];
  for (const row of [...plannedRows].sort((a, b) => Number(a.id) - Number(b.id))) {
    const id = Number(row.id);
    let anchor = -1;
    for (let i = 0; i < ids.length; i += 1) {
      if (!misplaced.has(i) && ids[i] > id) {
        anchor = i;
        break;
      }
    }
    const styleIndex = anchor > 0 ? anchor - 1 : (anchor === 0 ? 0 : parsed.elements.length - 1);
    insertions.push({
      row,
      anchor,
      anchorId: anchor >= 0 ? ids[anchor] : null,
      style: detectEntryStyle(raw, parsed.elements[styleIndex]),
    });
  }
  return { parsed, ids, insertions };
}

function buildMergedItemText(parsed, insertions) {
  const byAnchor = new Map();
  for (const insertion of insertions) {
    const key = insertion.anchor;
    if (!byAnchor.has(key)) byAnchor.set(key, []);
    byAnchor.get(key).push(insertion);
  }
  const parts = [parsed.prefix, parsed.lead];
  parsed.elements.forEach((element, i) => {
    for (const insertion of byAnchor.get(i) || []) {
      parts.push(serializeItemEntry(insertion.row, insertion.style), ITEM_GAP);
    }
    parts.push(parsed.raw.slice(element.start, element.end), parsed.gaps[i]);
  });
  const appends = byAnchor.get(-1) || [];
  if (appends.length) {
    if (parsed.elements.length) {
      // 原末尾元素之后换成标准分隔，新条目接管原末尾间隔
      parts.splice(parts.length - 1, 1, ITEM_GAP);
      for (const insertion of appends) {
        parts.push(serializeItemEntry(insertion.row, insertion.style), ITEM_GAP);
      }
      parts.push(parsed.gaps[parsed.gaps.length - 1]);
    } else {
      for (const insertion of appends) {
        parts.push(serializeItemEntry(insertion.row, insertion.style));
      }
    }
  }
  parts.push(parsed.tail);
  return parts.join('');
}

/**
 * 字节级校验：从合并文本里剔掉新增条目（按 id，新增 id 与既有不重复），
 * 用原有的前缀/前导/间隔/结尾重新组装，必须与原文逐字节一致——
 * 证明插入没有动过任何既有内容，连 [ 后的换行缩进都不能差。
 */
function verifyBytePreservation(raw, mergedText, addedRows) {
  const original = splitJsonArrayText(raw);
  const mergedParsed = splitJsonArrayText(mergedText);
  const addedIds = new Set(addedRows.map(row => Number(row.id)));
  const keptTexts = mergedParsed.elements
    .map(element => mergedText.slice(element.start, element.end))
    .filter(text => !addedIds.has(Number(JSON.parse(text).id)));
  if (keptTexts.length !== original.elements.length) return false;
  const parts = [original.prefix, original.lead];
  keptTexts.forEach((text, index) => {
    parts.push(text, original.gaps[index]);
  });
  parts.push(original.tail);
  return parts.join('') === raw;
}

/**
 * Plant.json 合并：按官方表序把新增条目插到「最近的前序本地条目」之后。
 * 本地 Plant.json 跟随官方表序（非 id 序），整体按 id 重排会产生上百处无意义 diff，
 * 因此只做定点插入；连续多个新增条目之间保持官方相对顺序。
 */
function mergePlantsByOfficialOrder(localRows, officialRows, plannedIds) {
  const localIndexById = new Map(localRows.map((row, index) => [Number(row.id), index]));
  const merged = [...localRows];
  const added = [];
  const insertions = [];
  let lastLocalIndex = -1;   // 已处理的最近本地条目索引（连续新增时作为链式锚点）
  let lastOfficialIndex = -1; // 已处理的最近官方条目下标
  for (let officialIndex = 0; officialIndex < officialRows.length; officialIndex += 1) {
    const official = officialRows[officialIndex];
    const officialId = Number(official.id);
    const localIndex = localIndexById.get(officialId);
    if (localIndex !== undefined) {
      lastLocalIndex = localIndex;
      lastOfficialIndex = officialIndex;
      continue;
    }
    if (!plannedIds.has(officialId)) continue;
    // 在官方序中向前找最近的本地条目作为锚点；找不到则接在上一处插入/本地条目之后
    let anchor = -1;
    for (let back = officialIndex - 1; back > lastOfficialIndex; back -= 1) {
      const candidate = localIndexById.get(Number(officialRows[back].id));
      if (candidate !== undefined) {
        anchor = candidate;
        break;
      }
    }
    const at = anchor >= 0 ? anchor + 1 : lastLocalIndex + 1;
    insertions.push({ at, order: officialIndex, row: official });
    added.push(official);
    lastLocalIndex = at;
    lastOfficialIndex = officialIndex;
  }
  // 从后往前 apply：插入点大的后插，保证先算出的索引依然有效；
  // 同插入点按官方序倒序 apply，使官方序在前的条目最终排在前面。
  insertions.sort((a, b) => (b.at - a.at) || (b.order - a.order));
  for (const insertion of insertions) {
    merged.splice(insertion.at, 0, insertion.row);
  }
  return { merged, added };
}

/**
 * 不变量校验：本地每一条必须在合并结果中逐字段完全未变。
 * 返回问题列表，空数组表示通过。
 */
function verifyExistingRowsUnchanged(localRows, mergedRows) {
  const mergedById = new Map(mergedRows.map(row => [Number(row.id), row]));
  const problems = [];
  for (const local of localRows) {
    const next = mergedById.get(Number(local.id));
    if (!next) {
      problems.push(`条目 ${local.id} 丢失`);
      continue;
    }
    for (const field of new Set([...Object.keys(local), ...Object.keys(next)])) {
      if (JSON.stringify(local[field]) !== JSON.stringify(next[field])) {
        problems.push(`${local.id}.${field}: ${JSON.stringify(local[field])} -> ${JSON.stringify(next[field])}`);
      }
    }
  }
  return problems;
}

/**
 * 派生守卫：新增物品不得是本地 Plant.json 已存在的种子 ID。
 * getSeedLevel 只查 type=5 的 seedItemMap，本不同步 type=5，这里是双保险。
 */
function verifyNoSeedIdCollision(addedRows, localPlants) {
  const localSeedIds = new Set(localPlants
    .map(plant => Number(plant.seed_id) || 0)
    .filter(id => id > 0));
  return addedRows
    .map(row => Number(row.id))
    .filter(id => localSeedIds.has(id));
}

function planPlantAdditions(localPlants, officialPlants, eventPlants) {
  const localIds = new Set(localPlants.map(plant => Number(plant.id)));
  const localSeedIds = new Set(localPlants
    .map(plant => Number(plant.seed_id) || 0)
    .filter(id => id > 0));
  const eventPlantIds = new Set(eventPlants.map(plant => Number(plant.id)));
  const eventSeedIds = new Set(eventPlants
    .map(plant => Number(plant.seed_id) || 0)
    .filter(id => id > 0));
  return officialPlants.filter((plant) => {
    const id = Number(plant.id);
    if (localIds.has(id)) return false;
    if (isInvalidPlant(plant)) return false;
    if (eventPlantIds.has(id) || (Number(plant.seed_id) > 0 && eventSeedIds.has(Number(plant.seed_id)))) return false;
    return true;
  });
}

function planItemAdditions(localItems, officialItems) {
  const localIds = new Set(localItems.map(item => Number(item.id)));
  const coveredTypes = new Set(localItems.map(item => Number(item.type)));
  const localSeedIds = new Set(localItems
    .filter(item => Number(item.type) === 5)
    .map(item => Number(item.id)));
  return officialItems.filter((item) => {
    const id = Number(item.id);
    const type = Number(item.type);
    if (localIds.has(id)) return false;
    // 种子/果实按策略不自动同步（会改变 getSeedLevel 与图鉴展示等级）
    if (type === 5 || type === 6) return false;
    if (isInvalidSeedId(id)) return false;
    if (type === 5 && localSeedIds.has(id)) return false;
    return coveredTypes.has(type) || EXTRA_ITEM_TYPES.has(type);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const source = resolveSource(args.source);
  const settingsFile = findSettingsFile(source);
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  const cacheRoot = path.join(os.tmpdir(), 'qq-farm-bot-cdn-resource-cache');
  const officialTables = await loadOfficialTables(settings, cacheRoot, args.refresh);

  const report = [];
  const writes = [];
  const localPlants = readLocalArray('Plant.json');

  for (const table of TABLES) {
    const officialRows = officialTables.get(table.official);
    if (!officialRows || !officialRows.length) {
      report.push(`${table.file}: 官方表 ${table.official} 未取到数据，跳过`);
      continue;
    }
    const localRows = readLocalArray(table.file);
    let planned;
    if (table.official === 'Plant') {
      planned = planPlantAdditions(localRows, officialRows, readEventPlants());
    } else {
      planned = planItemAdditions(localRows, officialRows);
    }
    const plannedIds = new Set(planned.map(row => Number(row.id)));

    // Plant.json：官方序定点插入 + 整体 2 空格序列化
    // ItemInfo.json：字节级定点插入，原文本一个字节都不动
    let merged;
    let added;
    let mergedText = '';
    let insertionNotes = [];
    if (table.official === 'Plant') {
      ({ merged, added } = mergePlantsByOfficialOrder(localRows, officialRows, plannedIds));
    } else {
      const raw = fs.readFileSync(path.join(CONFIG_DIR, table.file), 'utf8');
      const { parsed, insertions } = planItemInsertions(raw, planned);
      mergedText = buildMergedItemText(parsed, insertions);
      merged = JSON.parse(mergedText);
      added = insertions.map(insertion => insertion.row);
      // 字节级校验：剔除新增条目后必须与原文完全一致
      if (!verifyBytePreservation(raw, mergedText, added)) {
        report.push(`${table.file}: 字节级校验失败，合并结果改动了既有内容，拒绝写入`);
        continue;
      }
      const styles = {};
      const appendCount = insertions.filter(i => i.anchorId === null).length;
      for (const insertion of insertions) {
        styles[insertion.style] = (styles[insertion.style] || 0) + 1;
      }
      insertionNotes = [
        `  插入风格: ${Object.entries(styles).map(([style, count]) => `${style}×${count}`).join(', ')}`,
        `  插到末尾: ${appendCount} 条（其余均落在 id 升序主干的正确位置，字节级校验通过）`,
        `  插入锚点(新id→锚点id): ${insertions.map(i => `${i.row.id}→${i.anchorId === null ? '末尾' : i.anchorId}`).join(', ')}`,
      ];
    }

    // 校验一：既有条目逐字段不变
    const problems = verifyExistingRowsUnchanged(localRows, merged);
    if (problems.length) {
      report.push(`${table.file}: 校验失败，既有条目被改动 ${problems.length} 处，拒绝写入`);
      problems.slice(0, 10).forEach(msg => report.push(`  ${msg}`));
      continue;
    }
    // 校验二：新增条目不得撞本地 Plant.json 种子 ID
    const seedCollisions = verifyNoSeedIdCollision(added, localPlants);
    if (seedCollisions.length) {
      report.push(`${table.file}: 派生守卫失败，新增条目 ${seedCollisions.join(', ')} 已是本地种子 ID，拒绝写入`);
      continue;
    }

    const byType = {};
    for (const row of added) {
      const key = `type ${row.type}`;
      byType[key] = byType[key] || [];
      byType[key].push(`${row.id}:${row.name}`);
    }
    report.push(`${table.file}: 本地 ${localRows.length} 条 / 官方 ${officialRows.length} 条，计划新增 ${added.length} 条（既有条目校验通过）`);
    for (const key of Object.keys(byType).sort()) {
      report.push(`  ${key} (+${byType[key].length}): ${byType[key].join(', ')}`);
    }
    report.push(...insertionNotes);
    if (added.length) writes.push({ file: table.file, merged, mergedText, added });
  }

  process.stdout.write(`源码目录：${source}\n配置文件：${settingsFile}\n\n`);
  process.stdout.write(`${report.join('\n')}\n`);

  if (!writes.length) {
    process.stdout.write('\n没有需要同步的新条目。\n');
    return;
  }
  if (!args.write) {
    process.stdout.write('\n（dry-run）加 --write 落盘。\n');
    return;
  }
  for (const write of writes) {
    const target = path.join(CONFIG_DIR, write.file);
    const backup = `${target}.bak`;
    fs.copyFileSync(target, backup);
    if (write.mergedText) {
      // 文本模式：写入字节级插入结果，校验 round-trip 后可解析且行数只增不减
      const reparsed = JSON.parse(write.mergedText);
      if (!Array.isArray(reparsed)) throw new Error(`${write.file}: 合并结果不是数组`);
      fs.writeFileSync(target, write.mergedText);
      process.stdout.write(`已写入 ${target}（+${write.added.length}，原文件备份为 ${path.basename(backup)}）\n`);
    } else {
      fs.writeFileSync(target, `${JSON.stringify(write.merged, null, 2)}\n`);
      process.stdout.write(`已写入 ${target}（+${write.added.length}，原文件备份为 ${path.basename(backup)}）\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`错误：${error.message}\n`);
  process.exitCode = 1;
});
