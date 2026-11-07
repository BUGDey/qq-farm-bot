#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""扫描代码里的字面量静态资源路径，校验磁盘上是否真的存在 —— 专抓「图裂」。

两个坑最容易翻车：
  1) 图放上去了，但代码里的路径写错/大小写不一致（Windows 上不报错，Linux 上直接 404）
  2) 只同步了 seed_images_named，忘了 seed_images 子目录

用法：
    python tools/asset-fetcher/audit-image-refs.py            # 报告
    python tools/asset-fetcher/audit-image-refs.py --check    # CI：有问题退出码 1
"""
from __future__ import print_function

import argparse
import io
import os
import re
import sys

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC_DIRS = [os.path.join(ROOT, "web", "src"), os.path.join(ROOT, "core", "src")]
SKIP = ("node_modules", "dist", ".git")

PAT = re.compile(
    r"""['"`](/?(?:game-config|activity|assets)/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|webp|gif))['"`]"""
)


def candidates(path):
    rel = path.lstrip("/")
    out = [os.path.join(ROOT, "web", "public", rel)]
    if rel.startswith("game-config/"):
        tail = rel[len("game-config/"):]
        out.append(os.path.join(ROOT, "core", "src", "gameConfig", tail))
        out.append(os.path.join(ROOT, "core", "src", "gameConfig", "seed_images_named", tail))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="有问题时返回 1，可直接进 CI")
    args = ap.parse_args()

    found = {}
    for d in SRC_DIRS:
        for base, dirs, files in os.walk(d):
            if any(s in base for s in SKIP):
                continue
            for name in files:
                if not name.endswith((".ts", ".js", ".vue", ".mjs", ".cjs")):
                    continue
                fp = os.path.join(base, name)
                try:
                    src = io.open(fp, encoding="utf-8").read()
                except Exception:
                    continue
                for m in PAT.finditer(src):
                    found.setdefault(m.group(1), set()).add(os.path.relpath(fp, ROOT))

    bad = []
    for path, refs in sorted(found.items()):
        if not any(os.path.isfile(c) for c in candidates(path)):
            bad.append((path, sorted(refs)))

    print("代码字面量引用: %d | 缺失: %d" % (len(found), len(bad)))
    if bad:
        print("\n=== 缺失（真图裂）===")
        for path, refs in bad:
            print("  %s" % path)
            for r in refs[:3]:
                print("      <- %s" % r)
        return 1 if args.check else 0

    print("\n=== 全部命中，无图裂 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())