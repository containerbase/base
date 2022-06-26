#!/bin/bash

function check_tool_requirements () {
  check_command node
  check_semver "$TOOL_VERSION" "minor"
}

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  # get path location
  DIR="${BASH_SOURCE%/*}"
  if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

  # shellcheck disable=SC2046
  if [[ $(restore_folder_from_cache "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

    # shellcheck source=/dev/null
    . "$DIR/../../utils/node.sh"

    npm_init
    npm_install
    npm_clean

    # store in cache
    cache_folder "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}"
  fi
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  link_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  link_wrapper npx "${versioned_tool_path}/bin"

  hash -d npm npx 2>/dev/null || true
  npm --version
}
