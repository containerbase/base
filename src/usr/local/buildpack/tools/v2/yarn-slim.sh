#!/bin/bash

function check_tool_requirements () {
  check_command node
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  # get path location
  DIR="${BASH_SOURCE%/*}"
  if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

  # shellcheck source=/dev/null
  . "$DIR/../../utils/node.sh"

  # shellcheck disable=SC2046
  if [[ $(restore_folder_from_cache "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

    # shellcheck source=/dev/null
    . "$DIR/../../utils/node.sh"

    npm_init
    npm install "yarn@${TOOL_VERSION}" --global --no-audit --prefix "${versioned_tool_path}" --cache "${NPM_CONFIG_CACHE}" 2>&1
    npm_clean

    # patch yarn
    sed -i 's/ steps,/ steps.slice(0,1),/' "${versioned_tool_path}/lib/node_modules/yarn/lib/cli.js"

    # store in cache
    cache_folder "${versioned_tool_path}" "${TOOL_NAME}/${TOOL_VERSION}"
  fi

}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  link_wrapper yarn "${versioned_tool_path}/bin/yarn"
  yarn --version
}
