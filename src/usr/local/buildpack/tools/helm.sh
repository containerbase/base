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

    mkdir -p "${tool_path}/bin"

    file=/tmp/${TOOL_NAME}.tgz

    curl -sSfLo "${file}" "https://get.helm.sh/helm-v${TOOL_VERSION}-linux-amd64.tar.gz"
    tar --strip 1 -C "${tool_path}/bin" -xf "${file}"
    rm "${file}"
  fi

  link_wrapper "${TOOL_NAME}" "${tool_path}/bin"

  helm version
}
