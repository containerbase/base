#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=amd64

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"

  file=$(get_from_url "https://releases.hashicorp.com/terraform/${TOOL_VERSION}/terraform_${TOOL_VERSION}_linux_${arch}.zip")
  bsdtar -C "${versioned_tool_path}/bin" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  terraform version
}
