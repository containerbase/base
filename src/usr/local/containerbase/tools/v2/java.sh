#!/bin/bash

function prepare_tool () {
  # shellcheck source=/dev/null
  . "$(get_containerbase_path)/utils/java.sh"

  prepare_java
}

function install_tool () {
  # shellcheck source=/dev/null
  . "$(get_containerbase_path)/utils/java.sh"

  # TODO: try jre first (#127)
  install_java jdk
}

function link_tool () {
  # shellcheck source=/dev/null
  . "$(get_containerbase_path)/utils/java.sh"

  link_java
}
