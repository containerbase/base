#!/bin/bash

set -e

check_semver "${TOOL_VERSION}"


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p "${tool_path}/bin"

  file=/tmp/${TOOL_NAME}.tgz

  DISTRO=linux_amd64
  curl -sSfLo "${file}" "https://releases.hashicorp.com/terraform/${TOOL_VERSION}/terraform_${TOOL_VERSION}_${DISTRO}.zip"
  bsdtar -C "${tool_path}/bin" -xf "${file}"
  rm "${file}"
fi

link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

terraform version
