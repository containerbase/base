#!/bin/bash

set -e

check_command node

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  tool_path="$(create_versioned_tool_path)"

  temp_folder=$(mktemp -u)
  mkdir -p "${temp_folder}"

  mkdir -p "${tool_path}"

  NPM_CONFIG_PREFIX=$tool_path npm install --cache "${temp_folder}" -g "yarn@${TOOL_VERSION}"

  # Clean download cache
  NPM_CONFIG_PREFIX=$tool_path npm cache clean --force
  # Clean node-gyp cache
  rm -rf "$HOME/.cache" "${temp_folder}" "${USER_HOME}/.npm/_cacache"

  # patch yarn
  sed -i 's/ steps,/ steps.slice(0,1),/' "$tool_path/lib/node_modules/yarn/lib/cli.js"
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin/yarn"

yarn-slim --version
