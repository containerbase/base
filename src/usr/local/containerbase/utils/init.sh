#!/bin/bash

# Will install the tool in the given path according to the v2 tool spec
function init_tools () {
  local TOOL_NAME
  TOOL_NAME=${1}
  check TOOL_NAME true

  if [[ $(ignore_tool) -eq 1 ]]; then
    echo "Tool ignored - skipping: ${TOOL_NAME}"
    return
  fi

  TOOL="${CONTAINERBASE_DIR}/tools/v2/${TOOL_NAME}.sh"

  # load overrides needed for v2 tools
  # shellcheck source=/dev/null
  . "${CONTAINERBASE_DIR}/utils/v2/overrides.sh"

  if [[ -f "$TOOL" ]]; then
    # shellcheck source=/dev/null
    . "${TOOL}"
  else
    echo "tool ${TOOL_NAME} does not exist"
    exit 1
  fi

  init_tool_wrapper
}

function init_tool_wrapper () {
  local init_path
  init_path=$(get_tool_init_path)

  if [[ -f "${init_path}/${TOOL_NAME}" ]]; then
    # tool already initialized
    return
  fi

  if [[ ! -d "${init_path}" ]]; then
    create_folder "${init_path}" 775
  fi

  # ensure tool path exists
  create_tool_path > /dev/null

  # init tool
  init_tool

  touch "${init_path}/${TOOL_NAME}"
}
