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
  local tool=${1:-$TOOL_NAME}
  install_dir=$(get_install_dir)
  if [[ -d "${install_dir}/${tool}" ]]; then
    echo "${install_dir}/${tool}"
  fi
}

function find_versioned_tool_path () {
  local tool=${1:-$TOOL_NAME}
  local version=${2:-$TOOL_VERSION}
  tool_dir=$(find_tool_path "$tool")
  if [[ -d "${tool_dir}/${version}" ]]; then
    echo "${tool_dir}/${version}"
  fi
}

function create_versioned_tool_path () {
  local tool=${1:-$TOOL_NAME}
  install_dir=$(get_install_dir)

  local umask=775
  if [ "$(is_root)" -eq 0 ]; then
    umask=755
  fi

  # shellcheck disable=SC2174
  mkdir -p -m "${umask}" "${install_dir}/${tool}"
  mkdir -m "${umask}" "${install_dir}/${tool}/${TOOL_VERSION}"
  echo "${install_dir}/${tool}/${TOOL_VERSION}"
}

# Will set up the general folder structure for the whole buildpack installation
function setup_directories () {
  local install_dir
  install_dir=$(get_install_dir)

  mkdir -p "${install_dir}"
  # contains the installed tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_tools_path)"
  # contains env for the installed tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_env_path)"
  # contains the latest version of the tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_version_path)"
  # contains the wrapper and symlinks for the tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_bin_path)"
  # contains the certificates for the tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_ssl_path)"

  # if the bin path exists and does not have 775, force it
  if [ "$(stat --format '%a' "$(get_bin_path)")" -ne 775 ]; then
    echo "Forcing 775 on '$(get_bin_path)' ..."
    chmod 775 "$(get_bin_path)"
  fi
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
  echo "${BIN_DIR}"
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

# Gets the path to the ssl folder
function get_ssl_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/ssl"
}

# will get the correct umask based on the caller id
function get_umask () {
  if [ "$(is_root)" -eq 0 ]; then
    echo "${ROOT_UMASK}"
  else
    echo "${USER_UMASK}"
  fi
}


# Gets the path to the buildpack folder
function get_buildpack_path () {
  echo "${BUILDPACK_DIR}"
}
