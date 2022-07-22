#!/bin/bash

# Create a temp directory for the test or use
# the global one if defined in the given var.
# Returns the path to the temp directory
#
# The caller is responible to create the
# folder in the given var if it is set
function create_temp_dir () {
  local global_var=$1

  if [[ -z "${!global_var}" ]]; then
    temp_dir="$(mktemp -u)"
    # shellcheck disable=SC2174
    mkdir -m 777 -p "${temp_dir}" >/dev/null 2>&1
    echo "${temp_dir}"
  else
    echo "${!global_var}"
  fi
}

# Removes the temp dir in the first var
# if it is created for the test
# If the global env is set, nothing will be done
function clean_temp_dir () {
  local temp_dir=$1
  local global_var=$2

  if [[ -z "${!global_var}" ]]; then
    rm -rf "${temp_dir}"
  fi
}

# generates a random word to be used in tests
function random_word () {
  tr -dc A-Za-z0-9 </dev/urandom | head -c 13 ; echo ''
}
