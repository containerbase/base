#!/bin/bash

# Will overwrite certain util functions to make them testable

# set directories for test
export CONTAINERBASE_DIR="${TEST_DIR}/../../src/usr/local/containerbase"
export ROOT_DIR="${TEST_ROOT_DIR}/root"
export BIN_DIR="${TEST_ROOT_DIR}/bin"
export USER_HOME="${TEST_ROOT_DIR}/userhome"
export ENV_FILE="${TEST_ROOT_DIR}/env"


# Overwrite is_root function to check a test root user
# instead of the effective caller
function is_root () {
  if [[ $TEST_ROOT_USER -ne 0 ]]; then
    echo 1
  else
    echo 0
  fi
}
