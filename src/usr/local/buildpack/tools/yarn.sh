#!/bin/bash

set -e

check_command node

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  tool_path="$(create_versioned_tool_path)"

  NPM_CONFIG_PREFIX=$tool_path npm install --cache /tmp/empty-cache -g "${TOOL_NAME}@${TOOL_VERSION}"

  # Clean download cache
  NPM_CONFIG_PREFIX=$tool_path npm cache clean --force
  # Clean node-gyp cache
  rm -rf "$HOME/.cache" /tmp/empty-cache
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

yarn --version
