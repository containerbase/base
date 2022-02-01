#!/bin/bash

# Constants
ROOT_DIR=/opt/buildpack
ROOT_UMASK=750
USER_UMASK=770

# Will set up the general folder structure for the whole buildpack installation
# This will take $TEST_ROOT into account, so can also be used during testing
function setup_directories () {
  local install_dir
  install_dir=$(get_install_dir)

  mkdir -p "${install_dir}"
  # contains the installed tools
  mkdir -m 770 "$(get_tools_path)"
  # contains env for the installed tools
  mkdir -m 770 "$(get_env_path)"
  # contains the latest version of the tools
  mkdir -m 770 "$(get_version_path)"
  # contains the wrapper and symlinks for the tools
  mkdir -m 770 "$(get_bin_path)"
}

# Creates the given folder path with root and user umask depending on the caller
# Will also create intermediate folders with correct umask
function create_folder () {
  local folder=${1}
  check folder

  local parent
  parent=$(dirname "${folder}")

  if [ -d "${folder}" ]; then
    return
  fi

  if [ ! -d "${parent}" ]; then
    create_folder "$parent"
  fi

  local umask=$USER_UMASK
  if [ "$(is_root)" -eq 0 ]; then
    umask=$ROOT_UMASK
  fi

  mkdir -m "${umask}" "${folder}"
}

# Will get the install dir for the buildpack installation
function get_install_dir () {
  if [ -n "${LEGACY}" ]; then
    get_legacy_install_dir
  else
    # for testing we can set TEST_ROOT_DIR
    echo "${TEST_ROOT_DIR}${ROOT_DIR}"
  fi
}

# Will get the legacy install dir for the buildpack installation
function get_legacy_install_dir () {
    if [[ $EUID -eq 0 ]]; then
    echo /usr/local
  else
    # shellcheck disable=SC2153
    echo "${USER_HOME}"
  fi
}

# Gets the path to the bin folder
function get_bin_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/bin"
}

# Gets the path to the versions folder
function get_version_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/versions"
}

# Gets the path to the env folder
function get_env_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/env.d"
}

# Gets the path to the tools folder
function get_tools_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/tools"
}

# will get the correct umask based on the caller id
function get_umask () {
  if [ "$(is_root)" -eq 0 ]; then
    echo ${ROOT_UMASK}
  else
    echo ${USER_UMASK}
  fi
}

# Finds the path for the tool and returns it if is exits
function find_tool_path () {
  local tools_path
  tools_path=$(get_tools_path)

  if [[ -d "${tools_path}/${TOOL_NAME}" ]]; then
    echo "${tools_path}/${TOOL_NAME}"
  fi
}

# Finds the path for the tool and the version and returns it if is exits
function find_versioned_tool_path () {
  local tool_path
  tool_path=$(find_tool_path)

  if [[ -d "${tool_path}/${TOOL_VERSION}" ]]; then
    echo "${tool_path}/${TOOL_VERSION}"
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

  local umask
  umask=$(get_umask)

  mkdir -m "${umask}" "${tools_path}/${TOOL_NAME}"
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
