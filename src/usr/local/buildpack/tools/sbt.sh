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

  # https://github.com/sbt/sbt/releases/download/v1.5.2/sbt-1.5.2.tgz
  URL='https://github.com'

  curl -sSfLo ${file} "${URL}/${TOOL_NAME}/${TOOL_NAME}/releases/download/v${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}.tgz"
  tar --strip 1 -C ${tool_path} -xf ${file}
  rm ${file}

  # saves 1/3 size
  rm ${tool_path}/bin/*-darwin ${tool_path}/bin/*.exe ${tool_path}/bin/*.bat

  update_env ${tool_path}
  shell_wrapper ${TOOL_NAME}
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

sbt --version

