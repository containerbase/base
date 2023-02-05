#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux_amd64

  versioned_tool_path=$(create_versioned_tool_path)

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux_arm64
  fi
  file=$(get_from_url "https://github.com/fluxcd/flux2/releases/download/v${TOOL_VERSION}/flux_${TOOL_VERSION}_${arch}.tar.gz")
  tar -C "${versioned_tool_path}" -zxvf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}"
  flux -v
}
