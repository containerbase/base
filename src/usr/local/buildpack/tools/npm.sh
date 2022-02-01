#!/bin/bash

function legacy_tool_install () {

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
    INSTALL_DIR=$(get_install_dir)
    base_path=${INSTALL_DIR}/${TOOL_NAME}
    tool_path=${base_path}/${TOOL_VERSION}

    mkdir -p "${tool_path}"

    NPM_CONFIG_PREFIX=$tool_path $npm install --cache /tmp/empty-cache -g "npm@${TOOL_VERSION}"


    if [[ ${MAJOR} -lt 7 ]]; then
      # update to latest node-gyp to fully support python3
      NPM_CONFIG_PREFIX=$tool_path $npm explore npm -g -- npm install --cache /tmp/empty-cache node-gyp@latest
      rm -rf /tmp/empty-cache
    fi

    # Clean download cache
    NPM_CONFIG_PREFIX=$tool_path $npm cache clean --force
    # Clean node-gyp cache
    rm -rf "$HOME/.cache /tmp/empty-cache"
  fi

  link_wrapper "${TOOL_NAME}" "$tool_path/bin"
  link_wrapper npx "$tool_path/bin"
  hash -d "${TOOL_NAME}" npx 2>/dev/null || true

  npm --version
}

