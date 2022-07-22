#!/bin/bash

SEMVER_REGEX_ERLANG="^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\.(0|[1-9][0-9]*))?(\+[0-9]+)?([a-z-].*)?$"

function check_semver_erlang () {
  if [[ ! "${1}" =~ ${SEMVER_REGEX_ERLANG} ]]; then
    echo Not a semver like version - aborting: "${1}"
    exit 1
  fi
  export MAJOR=${BASH_REMATCH[1]}
  export MINOR=${BASH_REMATCH[3]}
  export PATCH=${BASH_REMATCH[5]}
  export BUILD=${BASH_REMATCH[7]}
}

function check_tool_requirements () {
  check_semver_erlang "${TOOL_VERSION}"
  if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" || ! "${BUILD}" ]]; then
    echo Invalid version: "${TOOL_VERSION}"
    exit 1
  fi
}

function prepare_tool() {
  local version_codename

  version_codename=$(get_distro)
  case "$version_codename" in
    "bionic") #apt_install \
      #libodbc1 \
      #libssl1.1 \
      #libsctp1 \
      ;;
    "focal") #apt_install \
      #libodbc1 \
      #libssl1.1 \
      #libsctp1 \
      ;;
    "jammy") #apt_install \
      #libodbc1 \
      #libssl3 \
      #libsctp1 \
      ;;
    *)
      echo "Tool '${TOOL_NAME}' not supported on: ${version_codename}! Please use ubuntu 'bionic', 'focal' or 'jammy'." >&2
      exit 1
    ;;
  esac

  local tool_path
  tool_path=$(create_tool_path)
}

function install_tool () {
  local tool_path
  local file
  local BASE_URL
  local ARCH
  local version_codename

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  ARCH=$(uname -p)
  BASE_URL="https://github.com/containerbase/${TOOL_NAME}-prebuild/releases/download"
  version_codename=$(get_distro)

  file=$(get_from_url "${BASE_URL}/${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}-${version_codename}-${ARCH}.tar.xz")
  tar -C "${tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  export_tool_env ERL_ROOTDIR "${versioned_tool_path}"
  shell_wrapper erl "${versioned_tool_path}/bin"
  erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell
}
