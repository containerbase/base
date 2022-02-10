#!/bin/bash

# Will set the version of the given tool to the given version in the versions folder
function set_tool_version () {
  local tool=${1:-$TOOL_NAME}
  local version=${2:-$TOOL_VERSION}

  check tool true
  check version true

  local version_path
  version_path=$(get_version_path)

  echo "${version}" > "${version_path}/${tool}"
  chmod 770 "${version_path}/${tool}"
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

# Gets the version env var for the given tool
# e.g
#   get_tool_version_env foo-bar
# returns
#   FOO_BAR_VERSION
function get_tool_version_env () {
  local tool=${1//-/_}
  check tool true

  tool=${tool^^}_VERSION
  echo "${tool}"
}
