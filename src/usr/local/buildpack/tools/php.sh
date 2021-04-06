#!/bin/bash

set -e

check_semver ${TOOL_VERSION}


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_path "\$HOME/.local/bin:${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${base_path}

  file=/tmp/php.tar.xz

  ARCH=$(uname -p)
  CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})
  BASE_URL="https://github.com/containerbase/php-prebuild/releases/download"

  curl -sSfLo ${file} ${BASE_URL}/${TOOL_VERSION}/php-${TOOL_VERSION}-${CODENAME}-${ARCH}.tar.xz

  if [[ -f ${file} ]]; then
    echo 'Using prebuild php'
    tar -C ${base_path} -xf ${file}
    rm ${file}
  else
    echo 'No prebuild php found' >&2
    exit 1
  fi

  update_env ${tool_path}
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

php --version

if [[ $EUID -eq 0 ]]; then
  shell_wrapper php
fi
