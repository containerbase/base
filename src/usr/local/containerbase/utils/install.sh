#!/bin/bash

# Will install the tool in the given path according to the v2 tool spec
function install_v2_tool () {
  local path=${1}
  check path

  # load overrides needed for v2 tools
  # shellcheck source=/dev/null
  . "${CONTAINERBASE_DIR}/utils/v2/overrides.sh"

  # shellcheck source=/dev/null
  . "${path}"

  if [[ ! -f "$(get_tool_prep)" && "${NEEDS_PREPARE}" -eq 1 ]]; then
    if [[ $(is_root) -ne 0 ]]; then
      echo "${TOOL_NAME} not prepared"
      exit 1
    fi
    prepare_tool_wrapper
  fi

  # init tool if required
  init_v2_tool

  check_tool_requirements

  if ! check_tool_installed; then
    echo "installing v2 tool ${TOOL_NAME} v${TOOL_VERSION}"
    install_tool
  else
    echo "tool ${TOOL_NAME} v${TOOL_VERSION} is already installed"
  fi

  # only link tools if the version is not active yet
  local current_version
  current_version="$(get_tool_version)"

  if [[ -n "${current_version}" ]] && [[ "${current_version}" = "${TOOL_VERSION}" ]]; then
    echo "tool is already linked: ${TOOL_NAME} v${TOOL_VERSION}"
  else
    echo "linking tool ${TOOL_NAME} v${TOOL_VERSION}"
    link_tool
  fi

  # Allow tools to do some additional stuff, like overwriting additional shell wrapper
  post_install

  # cleanup
  cleanup_cache
}
