#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function install_tool() {
  # always install with user umask
  # shellcheck disable=SC2034
  local ROOT_UMASK=${USER_UMASK}
  local python_minor_version
  local python_version
  local tool_path

  python_version=$(get_tool_version python)
  python_minor_version=$(get_python_minor_version "${python_version}")
  tool_path="$(create_versioned_tool_path)/${python_minor_version}"
  mkdir -p "${tool_path}"

  if [[ $(restore_folder_from_cache "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}") -ne 0 ]]; then
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
        setuptools \
        "${TOOL_NAME}==${TOOL_VERSION}"

    # remove virtualenv app-data
    rm -rf ~/.local/share/virtualenv

    # store in cache
    cache_folder "${tool_path}" "${TOOL_NAME}/${TOOL_VERSION}"
  fi
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || hashin --version
}
