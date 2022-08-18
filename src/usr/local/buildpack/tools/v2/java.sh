#!/bin/bash

function install_tool () {
  # shellcheck source=/dev/null
  . "${BUILDPACK_DIR}/utils/java.sh"

  # TODO: try jre first (#127)
  install_java jdk
}

function link_tool () {
  # shellcheck source=/dev/null
  . "${BUILDPACK_DIR}/utils/java.sh"

  link_java
}
