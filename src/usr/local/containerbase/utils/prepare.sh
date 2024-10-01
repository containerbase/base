#!/bin/bash

# Will install the tool in the given path according to the v2 tool spec
function prepare_tools () {
  local TOOL_NAME
  TOOL_NAME=${1}
  check TOOL_NAME true

  require_root

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

  prepare_tool_wrapper
}

function prepare_tool_wrapper () {
  # force root check
  require_root

  if [[ -f "$(get_tool_prep)" ]]; then
    # tool already prepared
    return
  fi

  # ensure tool path exists
  create_tool_path > /dev/null

  # prepare tool
  prepare_tool

  # set tool preped
  set_tool_prep

  # init tool
  init_v2_tool
}
