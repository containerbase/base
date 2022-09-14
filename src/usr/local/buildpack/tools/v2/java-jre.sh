#!/bin/bash

function prepare_tool () {
  # shellcheck source=/dev/null
  . "${BUILDPACK_DIR}/utils/java.sh"

  prepare_java
}

function install_tool () {
  # shellcheck source=/dev/null
  . "${BUILDPACK_DIR}/utils/java.sh"

  install_java jre
}

function link_tool () {
  # shellcheck source=/dev/null
  . "${BUILDPACK_DIR}/utils/java.sh"

  link_java
}
