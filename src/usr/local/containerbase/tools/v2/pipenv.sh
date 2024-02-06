#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function install_tool () {
  install_python_tool
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || pipenv --version
}
