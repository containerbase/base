#!/bin/bash

set -e

check_command node

if [[ $EUID -eq 0 ]]; then
  unset NPM_CONFIG_PREFIX
fi

npm install -g yarn@${TOOL_VERSION}

yarn --version

shell_wrapper yarn

# Clean download cache
npm cache clean --force
# Clean node-gyp cache
rm -rf /root/.cache
