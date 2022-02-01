#!/bin/bash

function legacy_tool_install () {
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

    mkdir -p "${tool_path}"

    file=/tmp/${TOOL_NAME}.tgz

    URL='https://downloads.lightbend.com'

    curl -sSfLo "${file}" "${URL}/${TOOL_NAME}/${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}.tgz"
    tar --strip 1 -C "${tool_path}" -xf "${file}"
    rm "${file}"
  fi

  link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

  scala --version
}


