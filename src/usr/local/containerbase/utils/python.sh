#!/bin/bash

function check_tool_requirements () {
  check_command python
  check_semver "$TOOL_VERSION" "all"
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

  python_version=$(get_tool_version python)
  tool_path="$(create_versioned_tool_path)/${python_version}"
  mkdir -p "${tool_path}"

  if [[ $(restore_folder_from_cache "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}/${python_version}") -ne 0 ]]; then
    # restore from cache not possible
    # either not in cache or error, install

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
