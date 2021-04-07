#!/bin/bash

set -e


check_command php

if [[ "${TOOL_VERSION}" -ne "latest" ]]; then
  check_semver ${TOOL_VERSION}


  if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
    echo Invalid version: ${TOOL_VERSION}
    exit 1
  fi
fi

tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_path "${1}/bin"
}


if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}/bin

  # OpenShift
  chmod g+w ${base_path}

  BASE_URL="https://raw.githubusercontent.com/composer/getcomposer.org/76a7060ccb93902cd7576b67264ad91c8a2700e2/web/installer"
  VERS_ARG=$([[ "${TOOL_VERSION}" -eq "latest" ]] && echo "" || echo "--version=${TOOL_VERSION}")

  curl -sSfL ${BASE_URL} | php -- $VERS_ARG --install-dir=${tool_path}/bin --filename=composer

  update_env ${tool_path}
  shell_wrapper composer
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

composer --version
