#!/bin/bash

set -e

check_command node
check_semver "$TOOL_VERSION"

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi

# shellcheck source=/dev/null
. /usr/local/buildpack/utils/node.sh

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  npm_init
  npm_install
  tool_path=$(find_versioned_tool_path)
  npm_clean
fi

link_wrapper "${TOOL_NAME}" "$tool_path/bin"
link_wrapper npx "$tool_path/bin"
hash -d npm npx 2>/dev/null || true

npm --version
