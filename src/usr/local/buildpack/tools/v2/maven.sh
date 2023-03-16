#!/bin/bash

function check_tool_requirements () {
  check_command java
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  local file
  # https://downloads.apache.org/maven/maven-3/3.8.1/binaries/apache-maven-3.8.1-bin.tar.gz
  local URL='https://downloads.apache.org'
  local file_name="apache-${TOOL_NAME}-${TOOL_VERSION}-bin.tar.gz"
  local file_url="${TOOL_NAME}/${TOOL_NAME}-${MAJOR}/${TOOL_VERSION}/binaries/${file_name}"

  local checksum_file
  local expected_checksum

  checksum_file=$(get_from_url "${URL}/${file_url}.sha512")
  # get checksum from file
  expected_checksum=$(cat "${checksum_file}")

  file=$(get_from_url \
    "${URL}/${file_url}" \
    "${file_name}" \
    "${expected_checksum}" \
    "sha512sum" )
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper mvn "${versioned_tool_path}/bin"

# TODO: check if still needed
#  reset_tool_env
#  export_tool_env MAVEN_HOME "${versioned_tool_path}"

  mvn --version
}
