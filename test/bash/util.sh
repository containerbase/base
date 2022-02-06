#!/bin/bash

# Will overwrite certain util functions to make them testable

# Overwrite is_root function to check a test root user
# instead of the effective caller
function is_root () {
  if [[ $TEST_ROOT_USER -ne 0 ]]; then
    echo 1
  else
    echo 0
  fi
}
