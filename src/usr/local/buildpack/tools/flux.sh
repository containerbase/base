#!/bin/bash

tool_path=$(find_tool_path)
if [[ -z "${tool_path}" ]]; then
  if [ -z $TOOL_VERSION ]; then
    TOOL_VERSION=$(curl https://api.github.com/repos/fluxcd/flux2/releases/latest -sL | grep tag_name | sed -E 's/.*"([^"]+)".*/\1/' | cut -c 2-)
  fi
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}
  mkdir -p ${tool_path}

  ARCH=amd64
  BIN_URL="https://github.com/fluxcd/flux2/releases/download/v${TOOL_VERSION}/flux_${TOOL_VERSION}_linux_${ARCH}.tar.gz"
  curl -sL ${BIN_URL} -o /tmp/flux.tar.gz
  mkdir -p /tmp/flux
  tar -C /tmp/flux/ -zxvf /tmp/flux.tar.gz

  require_root
  cp /tmp/flux/flux ${tool_path}

  rm -rf /tmp/flux/ /tmp/flux.tar.gz
fi

link_wrapper ${TOOL_NAME} ${tool_path}/bin

flux -v