#!/bin/bash

function check_tool_requirements () {
  check_command java
  # TODO: do we still need this ?
  if [[ "${TOOL_VERSION}" == "latest" ]]; then
    export "TOOL_VERSION=$(curl --retry 3 -sSfL https://services.gradle.org/versions/current | jq --raw-output '.version')"
  fi
  check_semver "$TOOL_VERSION" minor
}

function prepare_tool() {
  # shellcheck source=/dev/null
  . "$(get_buildpack_path)/utils/java.sh"
  create_maven_settings
  create_gradle_settings
  create_tool_path > /dev/null
}

function install_tool () {
  local tool_path
  local versioned_tool_path
  local file
  local URL='https://services.gradle.org/distributions'

  tool_path=$(find_tool_path)

  if [[ ! -d "${tool_path}" ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
    tool_path=$(find_tool_path)
  fi

  file=$(get_from_url "${URL}/gradle-${TOOL_VERSION}-bin.zip")

  versioned_tool_path=$(create_versioned_tool_path)
  bsdtar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper "${TOOL_NAME}" "${versioned_tool_path}/bin" "GRADLE_USER_HOME=\$HOME/.gradle"

  $SKIP_VERSION || gradle --version
}
