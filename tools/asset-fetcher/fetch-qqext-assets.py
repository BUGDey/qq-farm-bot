# -*- coding: utf-8 -*-
"""按 QQ 小游戏 bundle 清单，从官方 CDN 批量取回美术资源（可复用）。

为什么需要它
------------
游戏的美术资源（装扮图标、图鉴图标、活动贴图…）不在 `miniapp_src` 里，而在远程
Cocos bundle 中，只有客户端**实际加载过**才会落到本地缓存
（`.../QQEX/miniapp/fs/<uin>/1112386029/usr/gamecaches/<bundle>/`）。
所以「本地没图」≠「游戏里没有」——只要能从 bundle 清单拿到 uuid + hash，
就可以**直接按 CDN 地址下载**，不必等客户端把那个界面点开。

定位链（已验证）
----------------
1. bundle 清单 JSON（缓存里形如 `<bundle>/<本地id>.json`，含 `name`/`uuids`/`paths`/`versions`）：
   - `paths` : `"<index>" -> ["<资产路径>", <type>, ...]`
   - `uuids` : `<index>` 取出**压缩 uuid**（22 字符）
   - `versions.native[index]` / `versions.import[index]` : 该资产的版本 hash
2. 压缩 uuid → 标准 GUID（Cocos 私有字母表，**不是**标准 base64 顺序）：
   - 字母表 `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`
   - 前 2 个字符原样保留；之后每 2 字符 → 3 个 hex：
     `hex0 = r >> 2`, `hex1 = ((r & 3) << 2) | (s >> 4)`, `hex2 = s & 0xF`
     （r/s 是两字符的 6bit 值），再按 8-4-4-4-12 插连字符。
3. 下载地址：
   - 图片：`https://cdn-resource.nqf.qq.com/release/remote/<bundle>/native/<前2位>/<GUID>.<nativeHash>.png`
   - 数据：`https://cdn-resource.nqf.qq.com/release/remote/<bundle>/import/<前2位>/<GUID>.<importHash>.json`

用法
----
  # 1) 从缓存清单里筛出目标资源（先 dry-run 看清单）
  python fetch-qqext-assets.py --cache <gamecaches目录> --list skinDecorationIcon

  # 2) 真正下载
  python fetch-qqext-assets.py --cache <gamecaches目录> \\
      --match skinDecorationIcon --out <输出目录>

  # 3) 只看某个账号的缓存（默认自动挑文件最多的那个）
  python fetch-qqext-assets.py --uin 1000000001 --match skinDecorationIcon --out out/

参数
----
  --cache   指定 gamecaches 目录（默认在 %APPDATA%\\QQEX\\miniapp\\fs\\*\\1112386029\\usr\\gamecaches 里自动挑）
  --uin     指定账号目录名（fs/<uin>）
  --bundle  限定 bundle（extraRes / mainscene / plant …），默认全部
  --match   资产路径包含该子串才下载（可多次）
  --names-file  只下载这些「资产名」（文件里一行一个，取路径最后一段做精确匹配）；
                用于"ItemInfo.icon_res 需要哪些就补哪些"，避免把整个目录几百个都拉下来
  --list    只列出匹配到的资产，不下载
  --out     输出目录；文件名取资产路径最后一段
  --dump-map  把匹配到的资产映射（名字→bundle/GUID/hash）写成 JSON，便于改版后核对/重拉
  --bundle-tag  文件名前缀加上 bundle 名（默认关）

注意
----
- CDN 是本游戏官方静态资源站，直连即可；本机走代理反而容易失败 → 统一 `--noproxy '*'`，
  Windows 证书吊销检查可能离线 → 统一 `--ssl-no-revoke`。
- 只读游戏缓存，不修改；输出写到 `--out`。
"""

import argparse
import glob
import io
import json
import os
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CDN = "https://cdn-resource.nqf.qq.com/release/remote"
KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
VALS = {c: i for i, c in enumerate(KEYS)}


def uuid_to_guid(compact):
    """Cocos 压缩 uuid（22 字符）→ 标准 GUID。"""
    if len(compact) != 22:
        return ""
    hexes = [compact[0], compact[1]]
    for i in range(2, 22, 2):
        r = VALS.get(compact[i])
        s = VALS.get(compact[i + 1])
        if r is None or s is None:
            return ""
        hexes.append("%x" % (r >> 2))
        hexes.append("%x" % (((r & 3) << 2) | (s >> 4)))
        hexes.append("%x" % (s & 0xF))
    h = "".join(hexes)
    return "%s-%s-%s-%s-%s" % (h[0:8], h[8:12], h[12:16], h[16:20], h[20:32])


def pick_cache_dir(explicit, uin):
    if explicit:
        return explicit
    base = os.path.join(os.environ.get("APPDATA", ""), "QQEX", "miniapp", "fs")
    cands = []
    pattern = os.path.join(base, uin or "*", "1112386029", "usr", "gamecaches")
    for d in glob.glob(pattern):
        if not os.path.isdir(d):
            continue
        n = sum(len(fs) for _, _, fs in os.walk(d))
        cands.append((n, d))
    if not cands:
        return ""
    cands.sort(reverse=True)
    if len(cands) > 1:
        print("[i] 发现多个缓存目录，选文件最多的：")
        for n, d in cands[:5]:
            print("      %6d 文件  %s" % (n, d))
    return cands[0][1]


def load_bundle_manifests(cache_dir, bundle_filter):
    """从缓存里找出所有 bundle 清单 JSON 并解析。"""
    out = []
    for name in sorted(os.listdir(cache_dir)):
        sub = os.path.join(cache_dir, name)
        if not os.path.isdir(sub):
            continue
        if bundle_filter and name != bundle_filter:
            continue
        for fn in sorted(os.listdir(sub)):
            if not fn.endswith(".json"):
                continue
            p = os.path.join(sub, fn)
            try:
                d = json.load(io.open(p, encoding="utf-8", errors="replace"))
            except Exception:
                continue
            if not isinstance(d, dict) or "uuids" not in d or "paths" not in d:
                continue
            out.append({"bundle": name, "file": p, "manifest": d})
    return out


def native_hash(manifest, index):
    arr = (manifest.get("versions") or {}).get("native")
    if not isinstance(arr, list):
        return None
    for j in range(0, len(arr) - 1, 2):
        if arr[j] == index:
            return arr[j + 1]
    return None


def collect(cache_dir, bundle_filter, matches, names=None):
    """names 非空时只保留「路径最后一段」精确命中的资产。"""
    hits = {}
    for entry in load_bundle_manifests(cache_dir, bundle_filter):
        m = entry["manifest"]
        uuids = m.get("uuids") or []
        for idx_s, val in (m.get("paths") or {}).items():
            path = val[0] if isinstance(val, (list, tuple)) and val else ""
            if not path:
                continue
            if matches and not any(k in path for k in matches):
                continue
            if names is not None and path.split("/")[-1] not in names:
                continue
            try:
                idx = int(idx_s)
                compact = uuids[idx]
            except Exception:
                continue
            guid = uuid_to_guid(compact)
            if not guid:
                continue
            h = native_hash(m, idx)
            if not h:
                continue
            name = path.split("/")[-1]
            hits.setdefault(name, []).append(
                {"bundle": entry["bundle"], "path": path, "guid": guid, "hash": h}
            )
    # 同名去重：优先 extraRes（UI 资源主要在这），其余按 bundle 名排序
    dedup = {}
    for name, lst in hits.items():
        lst.sort(key=lambda x: (x["bundle"] != "extraRes", x["bundle"]))
        dedup[name] = lst[0]
    return dedup


def download(entry, out_dir, prefix_bundle):
    guid, h, bundle = entry["guid"], entry["hash"], entry["bundle"]
    url = "%s/%s/native/%s/%s.%s.png" % (CDN, bundle, guid[:2], guid, h)
    stem = entry["path"].split("/")[-1]
    if prefix_bundle:
        stem = "%s__%s" % (bundle, stem)
    dst = os.path.join(out_dir, stem + ".png")
    r = subprocess.run(
        ["curl", "-s", "-o", dst, "-w", "%{http_code} %{size_download}",
         "-m", "60", "--noproxy", "*", "--ssl-no-revoke", url],
        capture_output=True, text=True,
    )
    parts = (r.stdout or "").split()
    code = parts[0] if parts else "0"
    size = int(parts[1]) if len(parts) > 1 else 0
    if code == "200" and size > 200:
        return True, size, url
    try:
        os.remove(dst)
    except Exception:
        pass
    return False, 0, url


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="")
    ap.add_argument("--uin", default="")
    ap.add_argument("--bundle", default="")
    ap.add_argument("--match", action="append", default=[])
    ap.add_argument("--names-file", default="")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--out", default="")
    ap.add_argument("--bundle-tag", action="store_true")
    ap.add_argument("--dump-map", default="")
    args = ap.parse_args()

    cache_dir = pick_cache_dir(args.cache, args.uin)
    if not cache_dir or not os.path.isdir(cache_dir):
        print("[x] 找不到 gamecaches 目录，请用 --cache 指定")
        return 2
    print("[i] 缓存目录: %s" % cache_dir)

    names = None
    if args.names_file:
        raw = io.open(args.names_file, encoding="utf-8").read()
        names = {ln.strip() for ln in raw.splitlines() if ln.strip() and not ln.startswith("#")}
        print("[i] 名字清单: %d 个" % len(names))

    hits = collect(cache_dir, args.bundle, args.match, names)
    print("[i] 匹配到 %d 个资源" % len(hits))
    if not hits:
        return 1
    if args.dump_map:
        io.open(args.dump_map, "w", encoding="utf-8").write(
            json.dumps(hits, ensure_ascii=False, indent=1))
        print("[i] 映射已写出: %s (%d 条)" % (args.dump_map, len(hits)))
        return 0
    if args.list:
        for name in sorted(hits):
            e = hits[name]
            print("  %-40s %-10s %s" % (name, e["bundle"], e["guid"]))
        return 0

    if not args.out:
        print("[x] 需要 --out 指定输出目录")
        return 2
    os.makedirs(args.out, exist_ok=True)

    ok = fail = 0
    for name in sorted(hits):
        good, size, url = download(hits[name], args.out, args.bundle_tag)
        if good:
            ok += 1
            print("  [ok] %-38s %7d B" % (name, size))
        else:
            fail += 1
            print("  [!!] %-38s %s" % (name, url))
    print("\n完成：成功 %d / 失败 %d → %s" % (ok, fail, args.out))
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
