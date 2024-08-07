#!/usr/bin/env bash

function check_tool_requirements() {
  check_semver "$TOOL_VERSION" "minor"
  TOOL_VERSION=${MAJOR}.${MINOR}
}

function install_tool() {
  local versioned_tool_path
  local file
  local arch
  local build_path

  arch=$(uname -m)

  if [[ ${MAJOR} -lt 2 || (${MAJOR} -eq 2 && ${MINOR} -lt 24) ]]; then
    build_path="buildStatic.${arch}-linux"
  else
    build_path="buildStatic.nix.${arch}-linux"
  fi

  file=$(get_from_url "https://hydra.nixos.org/job/nix/maintenance-${TOOL_VERSION}/${build_path}/latest/download-by-type/file/binary-dist")

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  cp "${file}" "${versioned_tool_path}/bin/nix"
  chmod +x "${versioned_tool_path}/bin/nix"
}

function link_tool() {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  [[ -n $SKIP_VERSION ]] || nix --version
}
