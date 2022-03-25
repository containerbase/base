#!/bin/bash

function npm_init () {
  temp_folder=$(mktemp -u)
  mkdir -p "${temp_folder}"
  export NPM_CONFIG_CACHE="${temp_folder}" NO_UPDATE_NOTIFIER=1 NPM_CONFIG_FUND=false
}

function npm_install () {
  local tool_path=
  tool_path="$(create_versioned_tool_path)"

  npm install "${TOOL_NAME}@${TOOL_VERSION}" --global --no-audit --prefix "$tool_path" --cache "${NPM_CONFIG_CACHE}"

  if [[ "${TOOL_NAME}" == "npm" && ${MAJOR} -lt 7 ]]; then
    # update to latest node-gyp to fully support python3
    "$tool_path/bin/npm" explore npm --global --prefix "$tool_path" -- npm install node-gyp@latest --no-audit --cache "${NPM_CONFIG_CACHE}"
  fi
}

function npm_clean () {
  # Clean npm stuff
  rm -rf "$HOME/.cache" "${NPM_CONFIG_CACHE}" "$HOME/.npm/_logs"/*
}
