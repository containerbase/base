#!/bin/bash

# This file will overwrite certain functionality that is required for v2 tools
# e.g. for v2 tools we only support a single install directory for root and user installs
# Whenever a v2 tool is installed, this file gets sourced

# OVERWRITE:
#
# Will always return the root dir, no matter what user is calling the function
function get_install_dir () {
  echo "${ROOT_DIR}"
}

# OVERWRITE:
#
# Will return the path to the tools path, which is {installdir}/tools/{toolname} instead of {installdir}/{toolname}
function find_tool_path () {
  local tools_path
  tools_path=$(get_tools_path)

  if [[ -d "${tools_path}/${TOOL_NAME}" ]]; then
    echo "${tools_path}/${TOOL_NAME}"
  fi
}

# OVERWRITE:
#
# Creates the tool path in {installdir}/tools/{toolname} with 770 instead of in {installdir}/{toolname} with default umask
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

# OVERWRITE:
#
# Creates the versioned tool path in {installdir}/tools/{toolname}/{version} with user specific umask
# instead of in {installdir}/{toolname}/{version} with default umask
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
