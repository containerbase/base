#!/bin/bash

function prepare_tool() {
  local tool_path
  tool_path=$(create_tool_path)
}

function install_tool () {
  local arch
  local base_url
  local checksum_file
  local expected_checksum
  local file
  local name=${TOOL_NAME}
  local tool_path
  local version=${TOOL_VERSION}
  local versioned_tool_path

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  arch=$(uname -p)
  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"

  checksum_file=$(get_from_url "${base_url}/${version}/${name}-${version}-${arch}.tar.xz.sha512")
  expected_checksum=$(cat "${checksum_file}")

  file=$(get_from_url \
    "${base_url}/${version}/${name}-${version}-${arch}.tar.xz" \
    "${name}-${version}-${arch}.tar.xz" \
    "${expected_checksum}" \
    sha512sum
    )

  bsdtar -C "${tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper skopeo "${versioned_tool_path}/bin"
  skopeo --version
}
