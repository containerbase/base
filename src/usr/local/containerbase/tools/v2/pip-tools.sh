#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function split_python_version() {
  local python_version=$1
  if [[ ! "${python_version}" =~ ${SEMVER_REGEX} ]]; then
    echo Python is not a semver like version - aborting: "${python_version}"
    exit 1
  fi
  export PYTHON_MAJOR=${BASH_REMATCH[1]}
  export PYTHON_MINOR=${BASH_REMATCH[3]}
}

function install_tool () {
  local python_version

  python_version=$(get_tool_version python)
  split_python_version "${python_version}"

  if [[ (${PYTHON_MAJOR} == 3 && ${PYTHON_MINOR} -ge 9) || ${PYTHON_MAJOR} -gt 3 ]]; then
      install_python_tool 'keyrings.envvars >= 1.1.0'
  else
      # The keyrings.envvars package does not support python versions lower than 3.9
      install_python_tool
  fi
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || pip-compile --version
}

function post_install () {
  python_shell_wrapper pip-compile
}
