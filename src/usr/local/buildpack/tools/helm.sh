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
  export_tool_env MAVEN_HOME "${1}"
  export_tool_path "${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}

  file=/tmp/${TOOL_NAME}.tgz

  curl -sSfLo ${file} https://get.helm.sh/helm-v${TOOL_VERSION}-linux-amd64.tar.gz
  tar --strip 1 -C ${tool_path} -xf ${file}
  rm ${file}

  update_env ${tool_path}
  shell_wrapper mvn
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

helm version

shell_wrapper helm
