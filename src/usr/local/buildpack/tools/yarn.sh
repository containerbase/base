#!/bin/bash

set -e

check_command node

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  tool_path="$(create_versioned_tool_path)"

  temp_folder=$(mktemp -u)
  mkdir -p "${temp_folder}"

  npm cache clean --force
  NPM_CONFIG_PREFIX=$tool_path npm install --cache "${temp_folder}" -g "${TOOL_NAME}@${TOOL_VERSION}"

  # Clean download cache
  NPM_CONFIG_PREFIX=$tool_path npm cache clean --force
  # Clean node-gyp cache
  rm -rf "$HOME/.cache" "${temp_folder}"
  chmod -R 775 "${HOME}/.npm"
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

yarn --version
