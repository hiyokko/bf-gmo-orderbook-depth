#!/bin/zsh
set -euo pipefail

script_directory=${0:A:h}

if command -v node >/dev/null 2>&1; then
  node_binary=$(command -v node)
else
  print -u2 "Node.js 24以降が必要です。"
  exit 1
fi

node_major=$("$node_binary" -p "Number(process.versions.node.split('.')[0])")
if (( node_major < 24 )); then
  print -u2 "Node.js 24以降が必要です（検出: $("$node_binary" --version)）。"
  exit 1
fi

exec "$node_binary" "$script_directory/orderbook_depth_slack.mjs" "$@"
