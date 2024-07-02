#!/bin/bash

# Will overwrite certain util functions to make them testable

# set directories for test
export REPO_DIR="${TEST_DIR}/../.."
export CONTAINERBASE_DIR="${REPO_DIR}/src/usr/local/containerbase"
export ROOT_DIR="${TEST_ROOT_DIR}/root"
export BIN_DIR="${TEST_ROOT_DIR}/bin"
export LIB_DIR="${TEST_ROOT_DIR}/lib"
export USER_HOME="${TEST_ROOT_DIR}/user"
export ENV_FILE="${TEST_ROOT_DIR}/env"

# set default test user
export TEST_ROOT_USER=1000

# Overwrite is_root function to check a test root user
# instead of the effective caller
function is_root () {
  if [[ $TEST_ROOT_USER -ne 0 ]]; then
    echo 1
  else
    echo 0
  fi
}

function link_cli_tool () {
  local arch=amd64

  if [[ "${ARCHITECTURE}" = "aarch64" ]];then
    arch=arm64
  fi
  export PATH="${TEST_ROOT_DIR}/sbin:${PATH}"
  ln -sf "${REPO_DIR}/dist/cli/containerbase-cli-${arch}" "${TEST_ROOT_DIR}/sbin/containerbase-cli"
}

# ensure directories exist
mkdir -p "${TEST_ROOT_DIR}"/{sbin,root,user}
link_cli_tool
