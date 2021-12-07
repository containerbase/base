#!/bin/bash

set -e

check_command node

INSTALL_DIR=$(get_install_dir)
tool_path=$(find_tool_path)

function update_env () {
  PATH="${1}/bin:${PATH}"
  ln -sf ${1}/bin/yarn $INSTALL_DIR/bin/${TOOL_NAME}
}

if [[ -z "${tool_path}" ]]; then
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}

  NPM_CONFIG_PREFIX=$tool_path npm install --cache /tmp/empty-cache -g ${TOOL_NAME}@${TOOL_VERSION}

  # Clean download cache
  NPM_CONFIG_PREFIX=$tool_path npm cache clean --force
  # Clean node-gyp cache
  rm -rf $HOME/.cache /tmp/empty-cache

  # patch yarn
  sed -i 's/ steps,/ steps.slice(0,1),/' $tool_path/lib/node_modules/yarn/lib/cli.js

  update_env ${tool_path}
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

yarn --version
