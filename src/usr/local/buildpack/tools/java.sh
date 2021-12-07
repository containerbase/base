#!/usr/bin/env bash

set -e

check_semver $TOOL_VERSION

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_env JAVA_HOME "${1}"
  export_tool_path "${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p ${tool_path}

  file=/tmp/java.tgz

  ARCH=x64
  URL=https://api.adoptium.net/v3/assets/version
  API_ARGS='heap_size=normal&image_type=jdk&os=linux&page=0&page_size=1&project=jdk&vendor=adoptium'

  BIN_URL=$(curl -sSLf -H 'accept: application/json' "${URL}/${TOOL_VERSION}?architecture=${ARCH}&${API_ARGS}" \
    | jq --raw-output '.[0].binaries[0].package.link')

  curl -sSfLo ${file} ${BIN_URL}
  tar --strip 1 -C ${tool_path} -xf ${file}
  rm ${file}

  update_env ${tool_path}

  shell_wrapper java
else
  echo "Already installed, resetting env"
  update_env ${tool_path}
fi

java -version
