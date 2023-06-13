#!/bin/bash

function check_tool_requirements () {
  check_command java
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  local versioned_tool_path
  local file
  # https://archive.apache.org/dist/maven/maven-3/3.8.1/binaries/apache-maven-3.8.1-bin.tar.gz
  local URL='https://archive.apache.org/dist'
  local file_name="apache-${TOOL_NAME}-${TOOL_VERSION}-bin.tar.gz"
  local file_url="${TOOL_NAME}/${TOOL_NAME}-${MAJOR}/${TOOL_VERSION}/binaries/${file_name}"

  local checksum_file
  local checksum_algo
  local expected_checksum

  if [[ "$(file_exists "${URL}/${file_url}.sha512")" -eq 200 ]]; then
    checksum_file=$(get_from_url "${URL}/${file_url}.sha512")
    checksum_algo=sha512sum
    # get checksum from file
    expected_checksum=$(cut -d' ' -f1 "${checksum_file}")
  elif [[ "$(file_exists "${URL}/${file_url}.sha1")" -eq 200 ]]; then
    checksum_file=$(get_from_url "${URL}/${file_url}.sha1")
    checksum_algo=sha1sum
    # get checksum from file
    expected_checksum=$(cut -d' ' -f1 "${checksum_file}")
  else
    echo "Missing checksum"
    exit 1
  fi

  file=$(get_from_url \
    "${URL}/${file_url}" \
    "${file_name}" \
    "${expected_checksum}" \
    "${checksum_algo}" )

  versioned_tool_path=$(create_versioned_tool_path)
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper mvn "${versioned_tool_path}/bin"

# TODO: check if still needed
#  reset_tool_env
#  export_tool_env MAVEN_HOME "${versioned_tool_path}"

  [[ -n $SKIP_VERSION ]] || mvn --version
}
