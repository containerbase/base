#!/bin/bash

set -e

check_command node

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}

  NPM_CONFIG_PREFIX=$tool_path npm install --cache /tmp/empty-cache -g yarn@${TOOL_VERSION}

  # Clean download cache
  NPM_CONFIG_PREFIX=$tool_path npm cache clean --force
  # Clean node-gyp cache
  rm -rf $HOME/.cache /tmp/empty-cache

  # patch yarn
  sed -i 's/ steps,/ steps.slice(0,1),/' $tool_path/lib/node_modules/yarn/lib/cli.js
fi

link_wrapper ${TOOL_NAME} ${tool_path}/bin/yarn

yarn-slim --version
