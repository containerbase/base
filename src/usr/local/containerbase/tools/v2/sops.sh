#!/bin/bash

function prepare_tool() {
  create_tool_path > /dev/null
}

function install_tool () {
  local tool_path
  local file
  local base_url="https://github.com/getsops/${TOOL_NAME}/releases/download/v${TOOL_VERSION}"
  local arch=amd64
  local checksum_file
  local expected_checksum
  local file_name

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  if [[ "${ARCHITECTURE}" = "aarch64" ]];then
    arch=arm64
  fi

  file_name="${TOOL_NAME}-v${TOOL_VERSION}.linux.${arch}"

  checksum_file=$(get_from_url "${base_url}/${TOOL_NAME}-v${TOOL_VERSION}.checksums.txt")
  expected_checksum=$(grep "${file_name}" "${checksum_file}" | cut -d' ' -f1)

  file=$(get_from_url "${base_url}/${file_name}" "${TOOL_NAME}" "${expected_checksum}" "sha256sum")
  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  cp "${file}" "${versioned_tool_path}/bin/${TOOL_NAME}"
  chmod +x "${versioned_tool_path}/bin/${TOOL_NAME}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  sops --version
}
