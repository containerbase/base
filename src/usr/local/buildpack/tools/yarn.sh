#!/usr/bin/env bash

set -e

check_command node

if [[ $EUID -eq 0 ]]; then
  unset NPM_CONFIG_PREFIX
fi

npm install -g yarn@${TOOL_VERSION}

yarn --version

if [[ $EUID -eq 0 ]]; then
  shell_wrapper yarn
fi
