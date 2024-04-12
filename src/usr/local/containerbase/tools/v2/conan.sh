#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function prepare_tool () {
  apt_install gcc clang make cmake perl
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || conan --version
  conan profile detect
}
