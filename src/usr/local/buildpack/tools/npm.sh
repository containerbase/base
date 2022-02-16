#!/bin/bash

set -e

check_command node
check_semver "$TOOL_VERSION"

if [[ ! "${MAJOR}" || ! "${MINOR}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi

tool_path=$(find_versioned_tool_path)
npm=$(command -v npm)

if [[ -z "${tool_path}" ]]; then
  tool_path="$(create_versioned_tool_path)"

  temp_folder=$(mktemp -u)
  mkdir -p "${temp_folder}"

  $npm cache clean --force
  NPM_CONFIG_PREFIX=$tool_path $npm install --cache "${temp_folder}" -g "npm@${TOOL_VERSION}"

  if [[ ${MAJOR} -lt 7 ]]; then
    # update to latest node-gyp to fully support python3
    NPM_CONFIG_PREFIX=$tool_path $npm explore npm -g -- npm install --cache "${temp_folder}" node-gyp@latest
    rm -rf "${temp_folder}"
  fi

  # Clean download cache
  NPM_CONFIG_PREFIX=$tool_path $npm cache clean --force
  # Clean node-gyp cache
  rm -rf "$HOME/.cache" "${temp_folder}"
  chmod -R 775 "${HOME}/.npm"
fi

link_wrapper "${TOOL_NAME}" "$tool_path/bin"
link_wrapper npx "$tool_path/bin"
hash -d "${TOOL_NAME}" npx 2>/dev/null || true

npm --version
