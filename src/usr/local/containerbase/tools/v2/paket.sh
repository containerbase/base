#!/bin/bash

function check_tool_requirements () {
  check_command dotnet
  check_semver "$TOOL_VERSION" "all"
}

function install_tool () {
  dotnet tool install -g paket --version "${TOOL_VERSION}"
}

function link_tool () {
  shell_wrapper paket "/root/.dotnet/tools"
}

function test_tool () {
  paket --version
}
