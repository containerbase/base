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
  export_tool_path "${1}"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}

  file=/tmp/${TOOL_NAME}.tgz

  DISTRO=linux_amd64
  curl -sSfLo ${file} https://releases.hashicorp.com/terraform/${TOOL_VERSION}/terraform_${TOOL_VERSION}_${DISTRO}.zip
  unzip -q -d ${tool_path} ${file}
  rm ${file}

  update_env ${tool_path}
  shell_wrapper terraform
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

terraform version
