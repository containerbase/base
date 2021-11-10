#!/bin/bash

set -e

check_command node

if [[ $EUID -eq 0 ]]; then
  unset NPM_CONFIG_PREFIX
fi

npm install -g lerna@${TOOL_VERSION}

lerna --version

if [[ $EUID -eq 0 ]]; then
  shell_wrapper lerna
fi

# Clean download cache
npm cache clean --force
# Clean node-gyp cache
rm -rf /root/.cache
