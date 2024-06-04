#!/bin/bash

function check_tool_requirements () {
  check_command python
  check_semver "$TOOL_VERSION" "all"
}

function get_python_minor_version() {
  local python_version=$1
  if [[ ! "${python_version}" =~ ${SEMVER_REGEX} ]]; then
    echo Python is not a semver like version - aborting: "${python_version}"
    exit 1
  fi
  export PYTHON_MAJOR=${BASH_REMATCH[1]}
  echo "${BASH_REMATCH[1]}.${BASH_REMATCH[3]}"
}

function find_pip_versioned_path() {
  local python_version
  local tool_dir
  python_version=$(get_tool_version python)
  tool_dir="$(find_versioned_tool_path)/${python_version}"

  if [[ -d "${tool_dir}" ]]; then
    echo "${tool_dir}"
  fi
}

function check_tool_installed() {
  test -n "$(find_pip_versioned_path)"
}

# shellcheck disable=SC2120
function install_python_tool() {
  # always install with user umask
  # shellcheck disable=SC2034
  local ROOT_UMASK=${USER_UMASK}
  local python_version
  local tool_path

  if [[ ! -d "$(find_tool_path)" && "${NEEDS_PREPARE}" -eq 1 ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool
  fi

  python_version=$(get_tool_version python)
  tool_path="$(create_versioned_tool_path)/${python_version}"
  mkdir -p "${tool_path}"

  if [[ $(restore_folder_from_cache "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}/${python_version}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

    # export PIP_VERBOSE=1

    python -m virtualenv \
      --no-periodic-update \
      --quiet \
      "${tool_path}"

    "${tool_path}/bin/python" \
      -W ignore \
      -m pip \
        install \
        --compile \
        --use-pep517 \
        --no-warn-script-location \
        --no-cache-dir \
        --quiet \
        "${TOOL_NAME}==${TOOL_VERSION}" \
        "$@"

    unset PIP_VERBOSE

    # remove virtualenv app-data
    rm -rf ~/.local/share/virtualenv

    # store in cache
    cache_folder "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}/${python_version}"
  fi
}

function install_tool() {
  install_python_tool
}

function python_shell_wrapper () {
  local tool_path
  local tool=$1

  tool_path=$(find_pip_versioned_path)
  shell_wrapper "$tool" "${tool_path}/bin"
}

function post_install () {
  python_shell_wrapper "${TOOL_NAME}"
}
