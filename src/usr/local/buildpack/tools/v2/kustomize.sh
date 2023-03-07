#!/bin/bash

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux_amd64

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux_arm64
  fi

  local kustomize_file="${TOOL_NAME}_v${TOOL_VERSION}_${arch}.tar.gz"

  versioned_tool_path=$(create_versioned_tool_path)

  create_folder "${versioned_tool_path}/bin"
  file=$(get_from_url "https://github.com/kubernetes-sigs/${TOOL_NAME}/releases/download/${TOOL_NAME}%2Fv${TOOL_VERSION}/${kustomize_file}")
  bsdtar -C "${versioned_tool_path}/bin" -xf "${file}" "${TOOL_NAME}"
}

function link_tool () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"
  kustomize version
}
