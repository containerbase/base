#!/bin/bash

function check_tool_requirements () {
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux_amd64
  local helmfile_file="${TOOL_NAME}_${TOOL_VERSION#v}_${arch}.tar.gz"

  versioned_tool_path=$(create_versioned_tool_path)

  create_folder "${versioned_tool_path}/bin"
  file=$(get_from_url "https://github.com/${TOOL_NAME}/${TOOL_NAME}/releases/download/v${TOOL_VERSION}/${helmfile_file}")
  bsdtar -C "${versioned_tool_path}/bin" -xf "${file}" "${TOOL_NAME}"
}

function link_tool () {
  local versioned_tool_path

  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
  helmfile version
}
