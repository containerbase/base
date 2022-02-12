#!/bin/bash

# Will install the tool in the given path according to the v2 tool spec
function install_v2_tool () {
  local path=${1}
  check path

  # load overrides needed for v2 tools
  # shellcheck source=/dev/null
  . /usr/local/buildpack/utils/v2/overrides.sh

  # shellcheck source=/dev/null
  . "${path}"

  if ! check_tool_installed; then
    echo "installing tool ${TOOL_NAME} v${TOOL_VERSION}"
    check_tool_requirements
    install_tool
  else
    echo "tool ${TOOL_NAME} v${TOOL_VERSION} is already installed"
  fi

  # only link tools if the version is not active yet
  local current_version
  current_version="$(get_tool_version)"

  if [[ -n "${current_version}" ]] && [[ "${current_version}" = "${TOOL_VERSION}" ]]; then
    echo "tool is alredy linked: ${TOOL_NAME} v${TOOL_VERSION}"
  else
    echo "linking tool ${TOOL_NAME} v${TOOL_VERSION}"
    link_tool
    set_tool_version
  fi

  # cleanup
  cleanup_cache
}
