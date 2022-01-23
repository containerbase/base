#!/bin/bash

set -e

check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}/bin

  # https://github.com/jsonnet-bundler/jsonnet-bundler/releases/download/v0.4.0/jb-linux-amd64
  URL='https://github.com'

  curl -sSfLo ${tool_path}/bin/${TOOL_NAME} "${URL}/jsonnet-bundler/jsonnet-bundler/releases/download/v${TOOL_VERSION}/${TOOL_NAME}-linux-amd64"

  chmod +x ${tool_path}/bin/${TOOL_NAME}
fi

link_wrapper ${TOOL_NAME} ${tool_path}/bin

jb --version
