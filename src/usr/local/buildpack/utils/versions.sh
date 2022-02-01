#!/bin/bash

# Will set the version of the given tool to the given version in the versions folder
function set_tool_version () {
  local version_path
  version_path=$(get_version_path)

  echo "${TOOL_VERSION}" > "${version_path}/${TOOL_NAME}"
  chmod 770 "${version_path}/${TOOL_NAME}"
}

# Gets the version of the tool behind $TOOL_NAME or the first argument
# if it is set, empty otherwise
function get_tool_version () {
  local version_path
  local tool=${1:-$TOOL_NAME}
  check tool

  version_path=$(get_version_path)

  cat "${version_path}/${tool}" 2>&-
}
