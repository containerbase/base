#!/bin/bash

function legacy_tool_install () {

  tool_path=$(find_versioned_tool_path)
  if [[ -z "${tool_path}" ]]; then
    INSTALL_DIR=$(get_install_dir)
    base_path=${INSTALL_DIR}/${TOOL_NAME}
    tool_path=${base_path}/${TOOL_VERSION}
    mkdir -p "${tool_path}"

    ARCH=amd64
    BIN_URL="https://github.com/fluxcd/flux2/releases/download/v${TOOL_VERSION}/flux_${TOOL_VERSION}_linux_${ARCH}.tar.gz"
    curl -sL "${BIN_URL}" -o /tmp/flux.tar.gz
    tar -C "${tool_path}" -zxvf /tmp/flux.tar.gz
  fi

  link_wrapper "${TOOL_NAME}" "${tool_path}"

  flux -v

}
