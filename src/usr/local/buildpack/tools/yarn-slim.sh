#!/bin/bash

set -e

check_command node

# shellcheck source=/dev/null
. /usr/local/buildpack/utils/node.sh

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  npm_init
  tool_path="$(create_versioned_tool_path)"
  npm install "yarn@${TOOL_VERSION}" --global --no-audit --prefix "$tool_path" --cache "${NPM_CONFIG_CACHE}" 2>&1
  npm_clean

  # patch yarn
  sed -i 's/ steps,/ steps.slice(0,1),/' "$tool_path/lib/node_modules/yarn/lib/cli.js"
fi

link_wrapper yarn "${tool_path}/bin/yarn"

yarn --version
