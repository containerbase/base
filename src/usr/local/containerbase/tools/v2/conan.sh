#!/bin/bash

export NEEDS_PREPARE=1

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"


function prepare_tool () {
  if [[ ! -f "${USER_HOME}/.conan2/profiles/default" ]]; then
    mkdir -p "${USER_HOME}/.conan2/profiles" > /dev/null
    touch "${USER_HOME}/.conan2/profiles/default"
    chown -R "${USER_NAME}" "${USER_HOME}/.conan2"
    chmod -R g+w "${USER_HOME}/.conan2"
  fi
  create_tool_path > /dev/null
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || conan --version
}
