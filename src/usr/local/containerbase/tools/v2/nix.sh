#!/usr/bin/env bash

function install_tool() {
  local arch
  local checksum_file
  local expected_checksum
  local file
  local name=${TOOL_NAME}
  local tool_path
  local version=${TOOL_VERSION}
  local versioned_tool_path

  if [[ ${MAJOR} -lt 2 || (${MAJOR} -eq 2 && ${MINOR} -lt 10) || (${MAJOR} -eq 2 && ${MINOR} -eq 10 && ${PATCH} -lt 3) ]]; then
    echo "Nix version ${version} is not supported! Use v2.10.3 or higher." >&2
    exit 1
  fi

  arch=$(uname -m)
  base_url="https://github.com/containerbase/${name}-prebuild/releases/download"

  tool_path=$(create_tool_path)
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

function link_tool() {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin" "NIX_STORE_DIR=$(get_home_path)/nix/store NIX_DATA_DIR=$(get_home_path)/nix/data NIX_LOG_DIR=$(get_cache_path)/nix/log NIX_STATE_DIR=$(get_home_path)/nix/state NIX_CONF_DIR=$(get_home_path)/nix/conf"
  [[ -n $SKIP_VERSION ]] || nix --version
}
