#!/bin/bash

function check_tool_requirements () {
  check_command python
  check_semver "$TOOL_VERSION" "all"
}

function get_python_minor_version() {
  local python_version=$1
  if [[ ! "${python_version}" =~ ${SEMVER_REGEX} ]]; then
    echo Ruby is not a semver like version - aborting: "${python_version}"
    exit 1
  fi
  echo "${BASH_REMATCH[1]}.${BASH_REMATCH[3]}"
}

function find_pip_versioned_path() {
  local python_version
  local tool_dir
  python_version=$(get_tool_version python)
  tool_dir="$(find_versioned_tool_path)/$(get_python_minor_version "${python_version}")"

  if [[ -d "${tool_dir}" ]]; then
    echo "${tool_dir}"
  fi
}

function check_tool_installed() {
  test -n "$(find_pip_versioned_path)"
}

function install_tool() {
  local python_version
  local tool_path
  python_version=$(get_tool_version python)
  tool_path="$(create_versioned_tool_path)/$(get_python_minor_version "${python_version}")"
  mkdir -p "${tool_path}"
  pip install \
    --prefix "${tool_path}" \
    --compile \
    --use-pep517 \
    --no-warn-script-location \
    --no-cache-dir \
    --disable-pip-version-check \
    --root-user-action=ignore \
    --quiet \
    "${TOOL_NAME}==${TOOL_VERSION}"

  # clean cache https://pip.pypa.io/en/stable/reference/pip_cache/#pip-cache
  pip cache purge
}



function python_shell_wrapper () {
  local python_version
  local tool_path
  local tool=$1

  python_version=$(get_python_minor_version "$(get_tool_version python)")
  tool_path=$(find_pip_versioned_path)
  shell_wrapper "$tool" "${tool_path}/bin" "PYTHONPATH=${tool_path}/lib/python${python_version}/site-packages:\$PYTHONPATH"
}

function post_install () {
  python_shell_wrapper "${TOOL_NAME}"
}
