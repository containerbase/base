#!/bin/bash

function check_tool_requirements () {
  check_command java
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  local file
  local URL='https://github.com'

  # https://github.com/sbt/sbt/releases/download/v1.5.2/sbt-1.5.2.tgz
  file=$(get_from_url "${URL}/${TOOL_NAME}/${TOOL_NAME}/releases/download/v${TOOL_VERSION}/${TOOL_NAME}-${TOOL_VERSION}.tgz")

  versioned_tool_path=$(create_versioned_tool_path)
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
  rm "${versioned_tool_path}"/bin/*-darwin "${versioned_tool_path}"/bin/*.exe "${versioned_tool_path}"/bin/*.bat
}

function link_tool () {
  local versioned_tool_path
  local temp_dir
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper sbt "${versioned_tool_path}/bin"

  # https://github.com/sbt/sbt/issues/1458
  temp_dir="$(mktemp -d)"
  pushd "$temp_dir" || exit 1
  [[ -n $SKIP_VERSION ]] || sbt --version
  popd || exit 1

  # fix, cleanup sbt temp data
  rm -rf /tmp/.sbt ~/.sbt "$temp_dir"
}
