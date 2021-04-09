#!/usr/bin/env bash

set -e

check_command node

if [[ $EUID -eq 0 ]]; then
  unset NPM_CONFIG_PREFIX
fi

npm install -g npm@${TOOL_VERSION}

npm --version
