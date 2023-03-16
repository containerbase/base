#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux_amd64
  local helmfile_file

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux_arm64
  fi

  helmfile_file="${TOOL_NAME}_${TOOL_VERSION}_${arch}.tar.gz"
  file=$(get_from_url "https://github.com/${TOOL_NAME}/${TOOL_NAME}/releases/download/v${TOOL_VERSION}/${helmfile_file}")

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  bsdtar -C "${versioned_tool_path}/bin" -xf "${file}" "${TOOL_NAME}"
}

function link_tool () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
  helmfile version
}
