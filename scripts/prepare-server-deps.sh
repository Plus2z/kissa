#!/usr/bin/env bash
# 为 electron-builder 打包准备 server 的独立生产依赖树。
#
# server 是 workspace 包,npm 会把它 hoist 到根 node_modules;而打包时
# electron-builder 的 extraResources 需要一份完整、自包含的
# server/node_modules(运行在 resources/server 下,与根 node_modules 无关)。
# 因此在临时目录独立安装一次生产依赖再复制过去。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/.server-deps"
CACHE="$ROOT/.npm-cache"

rm -rf "$TMP"
mkdir -p "$TMP" "$CACHE"
cp "$ROOT/server/package.json" "$TMP/"

(cd "$TMP" && npm install --omit=dev --ignore-scripts --no-audit --no-fund --cache "$CACHE" --logs-max=0)

rm -rf "$ROOT/server/node_modules"
cp -r "$TMP/node_modules" "$ROOT/server/node_modules"

rm -rf "$TMP" "$CACHE"
echo "server/node_modules 已就绪: $(du -sh "$ROOT/server/node_modules" | cut -f1)"
