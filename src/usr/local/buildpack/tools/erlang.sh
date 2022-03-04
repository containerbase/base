#!/bin/bash

set -e

SEMVER_REGEX="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\+[0-9]+)?([a-z-].*)?$"

function check_semver () {
  if [[ ! "${1}" =~ ${SEMVER_REGEX} ]]; then
    echo Not a semver like version - aborting: "${1}"
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}
  export BUILD=${BASH_REMATCH[7]}
}

check_semver "${TOOL_VERSION}"


if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" || ! "${BUILD}" ]]; then
  echo Invalid version: "${TOOL_VERSION}"
  exit 1
fi

tool_path=$(find_versioned_tool_path)

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  base_path=${INSTALL_DIR}/${TOOL_NAME}
  tool_path=${base_path}/${TOOL_VERSION}

  mkdir -p "${base_path}"

  file=/tmp/${TOOL_NAME}.tar.xz

  ARCH=$(uname -p)
  BASE_URL="https://github.com/containerbase/${TOOL_NAME}-prebuild/releases/download"

  version_codename=$(get_distro)

   # TODO: extract to separate preparation tool
  require_root
  case "$version_codename" in
    "bionic") apt_install \
      libodbc1 \
      libssl1.1 \
      libsctp1 \
      ;;
    "focal") apt_install \
      libodbc1 \
      libssl1.1 \
      libsctp1 \
      ;;
  esac

  curl -sSfLo "${file}" "${BASE_URL}/${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz"

  if [[ -f ${file} ]]; then
    echo "Using prebuild ${TOOL_NAME}"
    tar -C "${base_path}" -xf "${file}"
    rm "${file}"
  else
    echo "No prebuild ${TOOL_NAME} found" >&2
    exit 1
  fi
fi

link_wrapper "erl" "${tool_path}/bin"

erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().'  -noshell
