#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux-amd64

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  file=$(get_from_url "https://github.com/vmware-tanzu/carvel-vendir/releases/download/v${TOOL_VERSION}/vendir-${arch}")

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  cp "${file}" "${versioned_tool_path}/bin/vendir"
  chmod +x "${versioned_tool_path}/bin/vendir"
}

function link_tool () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
  SKIP_VERSION || vendir --version
}
