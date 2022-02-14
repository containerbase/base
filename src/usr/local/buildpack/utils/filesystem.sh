#!/bin/bash

function get_install_dir () {
  if [ "$(is_root)" -eq 0 ]; then
    echo "${ROOT_DIR}"
  else
    # shellcheck disable=SC2153
    echo "${USER_HOME}"
  fi
}

function find_tool_path () {
  install_dir=$(get_install_dir)
  if [[ -d "${install_dir}/${TOOL_NAME}" ]]; then
    echo "${install_dir}/${TOOL_NAME}"
  fi
}

function find_versioned_tool_path () {
  tool_dir=$(find_tool_path)
  if [[ -d "${tool_dir}/${TOOL_VERSION}" ]]; then
    echo "${tool_dir}/${TOOL_VERSION}"
  fi
}

function create_versioned_tool_path () {
  install_dir=$(get_install_dir)
  # shellcheck disable=SC2174
  mkdir -p -m 775 "${install_dir}/${TOOL_NAME}"
  mkdir -p "${install_dir}/${TOOL_NAME}/${TOOL_VERSION}"
  echo "${install_dir}/${TOOL_NAME}/${TOOL_VERSION}"
}

# Will set up the general folder structure for the whole buildpack installation
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
# The umask can be provided with the second argument
function create_folder () {
  local folder=${1}
  check folder

  local umask=${2:-"$(get_umask)"}

  local parent
  parent=$(dirname "${folder}")

  if [ -d "${folder}" ]; then
    return
  fi

  if [ ! -d "${parent}" ]; then
    create_folder "$parent"
  fi

  mkdir -m "${umask}" "${folder}"
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
    echo "${ROOT_UMASK}"
  else
    echo "${USER_UMASK}"
  fi
}
