#!/bin/bash

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  create_folder "${versioned_tool_path}/bin"

  local file
  file=$(get_from_url "https://github.com/vmware-tanzu/carvel-vendir/releases/download/v${TOOL_VERSION}/vendir-linux-amd64")
  cp "${file}" "${versioned_tool_path}/bin/vendir"
  chmod +x "${versioned_tool_path}/bin/vendir"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  vendir --version
}
