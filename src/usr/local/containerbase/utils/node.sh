#!/bin/bash

function npm_init () {
  temp_folder=$(mktemp -u)
  mkdir -p "${temp_folder}"
  export NPM_CONFIG_CACHE="${temp_folder}" NO_UPDATE_NOTIFIER=1 NPM_CONFIG_FUND=false
}

function get_node_npm() {
  local node_version
  local npm
  node_version="$(get_tool_version node)"
  npm="$(get_tools_path)/node/${node_version}/bin/npm"

  echo "$npm"
}

function npm_install () {
  local versioned_tool_path
  local npm
  versioned_tool_path="$(create_versioned_tool_path)"
  npm="$(get_node_npm)"

  $npm install "${TOOL_NAME}@${TOOL_VERSION}" --save-exact --no-audit --prefix "$versioned_tool_path" --cache "${NPM_CONFIG_CACHE}" --silent 2>&1
  ln -sf "${versioned_tool_path}/node_modules/.bin" "${versioned_tool_path}/bin"

  if [[ "${TOOL_NAME}" == "npm" && ${MAJOR} -lt 7 ]]; then
    # update to latest node-gyp to fully support python3
    "$versioned_tool_path/bin/npm" explore npm --prefix "$versioned_tool_path" --silent -- npm install node-gyp@latest --no-audit --cache "${NPM_CONFIG_CACHE}" --silent 2>&1
  fi
}

function npm_clean () {
  # Clean npm stuff
  rm -rf "${NPM_CONFIG_CACHE}" "$HOME/.npm/_logs"/*
}
