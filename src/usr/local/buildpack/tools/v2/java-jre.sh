#!/bin/bash

function install_tool () {
  local versioned_tool_path
  versioned_tool_path=$(create_versioned_tool_path)

  local file
  local ARCH=x64
  local BIN_URL
  local URL=https://api.adoptium.net/v3/assets/version
  local API_ARGS='heap_size=normal&image_type=jre&os=linux&page=0&page_size=1&project=jdk'

  BIN_URL=$(curl -sSLf -H 'accept: application/json' "${URL}/${TOOL_VERSION}?architecture=${ARCH}&${API_ARGS}" \
    | jq --raw-output '.[0].binaries[0].package.link')

  file=$(get_from_url "${BIN_URL}")
  tar --strip 1 -C "${versioned_tool_path}" -xf "${file}"
}

function link_tool () {
  local versioned_tool_path
  versioned_tool_path=$(find_versioned_tool_path)

  shell_wrapper java "${versioned_tool_path}/bin"

# TODO: check if still needed
#  reset_tool_env
#  export_tool_env JAVA_HOME "${versioned_tool_path}"

  java -version
}
