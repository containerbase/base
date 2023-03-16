#!/bin/bash

function check_tool_requirements () {
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  local file
  local arch=linux-amd64
  local lfs_file
  local strip=0

  versioned_tool_path=$(create_versioned_tool_path)

  if [[ "$(uname -p)" = "aarch64" ]]; then
    arch=linux-arm64
  fi

  lfs_file="${TOOL_NAME}-${arch}-v${TOOL_VERSION}.tar.gz"
  file=$(get_from_url "https://github.com/${TOOL_NAME}/${TOOL_NAME}/releases/download/v${TOOL_VERSION}/${lfs_file}")

  # v3.2+ has a subdir https://github.com/git-lfs/git-lfs/pull/4980
  if [[ ${MAJOR} -gt 3 || (${MAJOR} -eq 3 && ${MINOR} -ge 2) ]]; then
    strip=1
  fi

  temp_dir="$(mktemp -d)"
  bsdtar --strip $strip -C "${temp_dir}" -xf "${file}"
  mkdir "${versioned_tool_path}/bin"
  mv "${temp_dir}/git-lfs" "${versioned_tool_path}/bin/"
  rm -rf "${temp_dir}"
}

function link_tool () {
  shell_wrapper "${TOOL_NAME}" "$(find_versioned_tool_path)/bin"

  git lfs version

  if [ "$(is_root)" -eq 0 ]; then
    git lfs install --system
  else
    git lfs install
  fi
}
