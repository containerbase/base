#!/bin/bash

set -e

check_command node

if [[ $EUID -eq 0 ]]; then
  unset NPM_CONFIG_PREFIX
fi

npm install -g npm@${TOOL_VERSION}

hash -d npm

npm --version

# Clean download cache
npm cache clean --force
# Clean node-gyp cache
if [[ $EUID -eq 0 ]]; then
  rm -rf /root/.cache
fi
