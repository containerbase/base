#!/bin/bash

function check_tool_requirements () {
  check_command java
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  local file
  local URL='https://downloads.lightbend.com'

  file=$(get_from_url "${URL}/${TOOL_NAME}/${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}.tgz")

  versioned_tool_path=$(create_versioned_tool_path)
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper scala "${versioned_tool_path}/bin"

  scala --version
}
