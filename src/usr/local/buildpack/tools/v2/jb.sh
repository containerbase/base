#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=amd64

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  file=$(get_from_url "https://github.com/jsonnet-bundler/jsonnet-bundler/releases/download/v${TOOL_VERSION}/${TOOL_NAME}-linux-${arch}")

  cp "${file}" "${versioned_tool_path}/bin/jb"
  chmod +x "${versioned_tool_path}/bin/jb"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  jb --version
}
