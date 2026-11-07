# 资源工具（asset-fetcher）

游戏的美术资源不在代码仓库里，而在远程 Cocos bundle 中——客户端**点开过那个界面**才会落到本地缓存。所以「本地没图」不等于「游戏里没有图」。

这个目录用来做三件事：**从官方 CDN 直接取图**、**审计图裂**、**审计漏登记**。

## 1. 取图：`fetch-qqext-assets.py`

```bash
# 先看能拿到哪些（不下载）
python tools/asset-fetcher/fetch-qqext-assets.py --list --match skinIcon

# 真正下载
python tools/asset-fetcher/fetch-qqext-assets.py \
    --match skinIcon --out core/src/gameConfig/seed_images_named

# 只取指定的名字（一行一个），避免把整个目录拉下来
python tools/asset-fetcher/fetch-qqext-assets.py \
    --names-file names.txt --out core/src/gameConfig/seed_images_named
```

定位链：bundle 清单（`uuids` / `paths` / `versions`）→ 22 字符压缩 uuid 转 GUID → 拼 CDN 地址

```
https://cdn-resource.nqf.qq.com/release/remote/<bundle>/native/<GUID前2位>/<GUID>.<hash>.png
```

默认自动在 `%APPDATA%\QQEX\miniapp\fs\*\1112386029\usr\gamecaches` 里挑文件最多的账号目录，也可以用 `--cache` / `--uin` 指定。

> CDN 直连即可，走代理反而容易失败，脚本内部已统一 `--noproxy *`；Windows 上证书吊销检查可能离线，统一加了 `--ssl-no-revoke`。

## 2. 审计图裂：`audit-image-refs.py`

扫描 `web/src` 与 `core/src` 里所有字面量静态资源路径，逐个核对文件是否真的存在。

```bash
python tools/asset-fetcher/audit-image-refs.py            # 报告
python tools/asset-fetcher/audit-image-refs.py --check    # CI：有问题退出码 1
```

当前状态：**114 处引用，0 缺失**。

## 3. 审计漏登记：`audit-item-images.js`

图下载好了、也放进目录了，但**映射表没登记**，界面上照样是裂的。这个脚本直接调真实的 `gameConfig.getItemImageById()`，而不是自己猜路径。

```bash
node tools/asset-fetcher/audit-item-images.js            # 报告
node tools/asset-fetcher/audit-item-images.js --check    # CI：有问题退出码 1
```

它检查两件事：

1. 装扮清单里每一件都能取到图（缺图会列出来）；
2. `ItemInfo.json` 里所有 `type=18` / `type=10` 的条目都被分类规则收进了清单（漏登记会列出来）。

占位项（`2101/2102/2103` 三个没有美术的空头像框、`204001` 默认盆栽空槽）按设计排除，不算问题。

当前状态：**119 件，缺图 0，漏登记 0**。

## 可进 CI

```yaml
- run: python tools/asset-fetcher/audit-image-refs.py --check
- run: node tools/asset-fetcher/audit-item-images.js --check
```