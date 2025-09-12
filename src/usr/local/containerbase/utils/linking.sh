#!/bin/bash

# use this if custom env is required, creates a shell wrapper to /opt/containerbase/bin
function shell_wrapper () {
  local SOURCE=$2
  if [[ -z "$SOURCE" ]]; then
    SOURCE=$(command -v "${1}")
  fi
  if [[ -d "$SOURCE" ]]; then
    SOURCE=$SOURCE/${1}
  fi
  check SOURCE true
  check_command "$SOURCE"
  containerbase-cli lt "$1" "$SOURCE" "$3" "$4" "$5"
}

# use this for simple symlink to /opt/containerbase/bin
function link_wrapper () {
  local TARGET
  local SOURCE=$2
  TARGET="$(get_bin_path)/${1}"
  if [[ -z "$SOURCE" ]]; then
    SOURCE=$(command -v "${1}")
  fi
  if [[ -d "$SOURCE" ]]; then
    SOURCE=$SOURCE/${1}
  fi
  check_command "$SOURCE"
  ln -sf "$SOURCE" "$TARGET"
}
