#!/bin/bash

function check_tool_requirements () {
  check_command node
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)


  if [[ $(restore_folder_from_cache "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

    # shellcheck source=/dev/null
    . "$(get_buildpack_path)/utils/node.sh"

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
  lerna --version
}
