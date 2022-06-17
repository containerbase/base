#!/bin/bash

function check_tool_requirements () {
  check_command node
  check_semver "$TOOL_VERSION"
  validate_semver
}

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  # get path location
  DIR="${BASH_SOURCE%/*}"
  if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

  # shellcheck source=/dev/null
  . "$DIR/../../utils/node.sh"

  npm_init
  npm_install
  npm_clean
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  link_wrapper "${TOOL_NAME}" "$versioned_tool_path/bin"
  pnpm --version
}
