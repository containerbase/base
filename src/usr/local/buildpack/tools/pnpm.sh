#!/bin/bash

set -e

check_command node

if [[ $EUID -eq 0 ]]; then
  unset NPM_CONFIG_PREFIX
fi

npm install -g pnpm@${TOOL_VERSION}

pnpm --version

if [[ $EUID -eq 0 ]]; then
  shell_wrapper pnpm
fi

# Clean download cache
npm cache clean --force
# Clean node-gyp cache
rm -rf /root/.cache
