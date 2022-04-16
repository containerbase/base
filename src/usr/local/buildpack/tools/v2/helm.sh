#!/bin/bash

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  create_folder "${versioned_tool_path}/bin"

  local file
  file=$(get_from_url "https://get.helm.sh/helm-v${TOOL_VERSION}-linux-amd64.tar.gz")

  if [[ -f ${file} ]]; then
    tar --strip 1 -C "${versioned_tool_path}/bin" -xf "${file}"
  else
    echo "No file found for version ${TOOL_VERSION}"
    exit 1
  fi
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  helm version
}
