#!/bin/bash

function get_install_dir () {
  if [ "$(is_root)" -eq 0 ]; then
    echo "${ROOT_DIR}"
  else
    # shellcheck disable=SC2153
    echo "${USER_HOME}"
  fi
}

function find_tool_path () {
  install_dir=$(get_install_dir)
  if [[ -d "${install_dir}/${TOOL_NAME}" ]]; then
    echo "${install_dir}/${TOOL_NAME}"
  fi
}

function find_versioned_tool_path () {
  tool_dir=$(find_tool_path)
  if [[ -d "${tool_dir}/${TOOL_VERSION}" ]]; then
    echo "${tool_dir}/${TOOL_VERSION}"
  fi
}

function create_versioned_tool_path () {
  install_dir=$(get_install_dir)
  mkdir -p "${install_dir}/${TOOL_NAME}/${TOOL_VERSION}"
  echo "${install_dir}/${TOOL_NAME}/${TOOL_VERSION}"
}
