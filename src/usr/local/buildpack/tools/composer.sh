#!/bin/bash

set -e


check_command php

if [[ "${TOOL_VERSION}" == "latest" ]]; then
  export "TOOL_VERSION=$(curl -s https://api.github.com/repos/composer/composer/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')"
fi

check_semver "${TOOL_VERSION}"


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo "Invalid version: ${TOOL_VERSION}"
  exit 1
fi

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p "${tool_path}"/bin

  # OpenShift
  chmod g+w "${base_path}"

  BASE_URL="https://github.com/composer/composer/releases/download"

  curl -sSfLo "${tool_path}"/bin/composer ${BASE_URL}/"${TOOL_VERSION}"/composer.phar
  chmod +x "${tool_path}"/bin/composer
fi

  link_wrapper "${TOOL_NAME}" "${tool_path}"/bin

composer --version
