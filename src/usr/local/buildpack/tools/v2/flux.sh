#!/bin/bash

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  local file
  local ARCH=amd64
  file=$(get_from_url "https://github.com/fluxcd/flux2/releases/download/v${TOOL_VERSION}/flux_${TOOL_VERSION}_linux_${ARCH}.tar.gz")

  if [[ -f ${file} ]]; then
    tar -C "${versioned_tool_path}" -zxvf "${file}"
  else
    echo "No file found for version ${TOOL_VERSION}"
    exit 1
  fi
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  link_wrapper "${TOOL_NAME}" "${versioned_tool_path}"
  flux -v
}
