#!/bin/bash

set -e

check_command node

# shellcheck source=/dev/null
. /usr/local/buildpack/utils/node.sh

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  npm_init
  npm_install
  tool_path=$(find_versioned_tool_path)
  npm_clean
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

corepack --version

corepack enable --install-directory "$(get_bin_path)"
