#!/bin/bash

function prepare_tool() {
  local version_codename

  version_codename=$(get_distro)
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

  create_tool_path
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

  shell_wrapper "erl" "${versioned_tool_path}/bin"
  erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell
}
