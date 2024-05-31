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

# Will set up the general folder structure for the whole containerbase installation
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
  mkdir -p -m 775 "${install_dir}/bin"
  # contains nodejs files and maybe others
  # shellcheck disable=SC2174
  mkdir -p -m 775 "${install_dir}/lib"
  # contains the certificates for the tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_ssl_path)"
  # contains the caches for the tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_cache_path)"
  # contains the home for the tools
  # shellcheck disable=SC2174
  mkdir -p -m 775 "$(get_home_path)"

  # symlink v2 tools bin and lib
  rm -rf "${BIN_DIR}" "${LIB_DIR}"
  ln -sf "${ROOT_DIR}/bin" "${BIN_DIR}"
  ln -sf "${ROOT_DIR}/lib" "${LIB_DIR}"
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
  echo "${ROOT_DIR}/bin"
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

# Gets the path to the cache folder
function get_cache_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/cache"
}

# Gets the path to the home folder
function get_home_path () {
  local install_dir
  install_dir=$(get_install_dir)
  echo "${install_dir}/home"
}

# will get the correct umask based on the caller id
function get_umask () {
  if [ "$(is_root)" -eq 0 ]; then
    echo "${ROOT_UMASK}"
  else
    echo "${USER_UMASK}"
  fi
}


# Gets the path to the containerbase folder
function get_containerbase_path () {
  echo "${CONTAINERBASE_DIR}"
}

# Own the file by default user and make it writable for root group
function set_file_owner() {
  local target=${1}
  local perms=${2:-775}

  # make it writable for the owner and the group
  if [[ -O "${target}" ]] && [ "$(stat --format '%a' "${target}")" -ne "${perms}" ] ; then
    # make it writable for the owner and the group only if we are the owner
    chmod "${perms}" "${target}"
  fi
  # make it writable for the default user
  if [[ -O "${target}" ]] && [ "$(stat --format '%u' "${target}")" -eq "0" ] ; then
    # make it writable for the owner and the group only if we are the owner
    chown "${USER_ID}" "${target}"
  fi
}
