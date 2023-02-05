#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local arch=linux-amd64
  local file

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  file=$(get_from_url "https://get.helm.sh/helm-v${TOOL_VERSION}-${arch}.tar.gz")
  tar --strip 1 -C "${versioned_tool_path}/bin" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  helm version
}
