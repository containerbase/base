#!/bin/bash

# This file will overwrite certain functionality that is required for v2 tools
# e.g. for v2 tools we only support a single install directory for root and user installs
# Whenever a v2 tool is installed, this file gets sourced

# Gets the install directory where all buildpack features are installed
function get_install_dir () {
  echo "${ROOT_DIR}"
}

# Finds the path for the tool and returns it if is exits
function find_tool_path () {
  local tools_path
  tools_path=$(get_tools_path)

  if [[ -d "${tools_path}/${TOOL_NAME}" ]]; then
    echo "${tools_path}/${TOOL_NAME}"
  fi
}

# Creates the path to the given tool and returns it
function create_tool_path () {
  local tools_path
  tools_path=$(get_tools_path)

  if [ -d "${tools_path}/${TOOL_NAME}" ]; then
    echo "${tools_path}/${TOOL_NAME}"
    return
  fi

  create_folder "${tools_path}/${TOOL_NAME}" 770
  echo "${tools_path}/${TOOL_NAME}"
}

# Creates the path to the given tool and the given version and returns it
function create_versioned_tool_path () {
  local tool_path
  tool_path=$(create_tool_path)

  if [ -d  "${tool_path}/${TOOL_VERSION}" ]; then
    echo  "${tool_path}/${TOOL_VERSION}"
    return
  fi

  local umask
  umask=$(get_umask)

  mkdir -m "${umask}" "${tool_path}/${TOOL_VERSION}"
  echo "${tool_path}/${TOOL_VERSION}"
}
