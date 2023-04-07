#!/bin/bash
function check_tool_requirements () {
  check_command php

  if [[ "${TOOL_VERSION}" == "latest" ]]; then
    export "TOOL_VERSION=$(curl --retry 3 -sSfL https://api.github.com/repos/composer/composer/releases/latest | jq --raw-output '.tag_name')"
  fi
  check_semver "${TOOL_VERSION}" all
}

function install_tool () {
  local versioned_tool_path
  local file

  file=$(get_from_url "https://github.com/composer/composer/releases/download/${TOOL_VERSION}/composer.phar")

  versioned_tool_path=$(create_versioned_tool_path)
  create_folder "${versioned_tool_path}/bin"
  cp "${file}" "${versioned_tool_path}/bin/composer"
  chmod +x "${versioned_tool_path}/bin/composer"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin"
  SKIP_VERSION || composer --version
}
