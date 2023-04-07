#!/bin/bash

function check_tool_requirements () {
  check_command node
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  local node_version
  versioned_tool_path=$(create_versioned_tool_path)

  if [[ $(restore_folder_from_cache "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

    # shellcheck source=/dev/null
    . "$(get_buildpack_path)/utils/node.sh"

    npm_init
    npm_install
    npm_clean

    node_version="$(get_tool_version node)"

    # pin node version
    sed -i --follow-symlinks "1 s:.*:#\!\/opt\/buildpack\/tools\/node\/${node_version}\/bin\/node:" "${versioned_tool_path}/bin/renovate";
    sed -i --follow-symlinks "1 s:.*:#\!\/opt\/buildpack\/tools\/node\/${node_version}\/bin\/node:" "${versioned_tool_path}/bin/renovate-config-validator";

    # store in cache
    cache_folder "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}"
  fi
}

function link_tool () {
  post_install
  $SKIP_VERSION || renovate --version
}

function post_install () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
  shell_wrapper "${TOOL_NAME}-config-validator" "$(find_versioned_tool_path)/bin"
}
