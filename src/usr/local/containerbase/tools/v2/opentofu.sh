#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux_amd64

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux_arm64
  fi

  file=$(get_from_url "https://github.com/opentofu/opentofu/releases/download/v${TOOL_VERSION}/tofu_${TOOL_VERSION}_${arch}.zip")

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"

  bsdtar -C "${versioned_tool_path}/bin" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "tofu" "${versioned_tool_path}/bin"
  tofu version
}
