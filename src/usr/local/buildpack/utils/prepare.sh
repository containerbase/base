#!/bin/bash

# Will install the tool in the given path according to the v2 tool spec
function prepare_v2_tool () {
  local TOOL_NAME
  TOOL_NAME=${1}

  check TOOL_NAME true

  require_root

  if [[ $(ignore_tool) -eq 1 ]]; then
    echo "Tool ignored - skipping: ${TOOL_NAME}"
    exit 0;
  fi

  V2_TOOL="/usr/local/buildpack/tools/v2/${TOOL_NAME}.sh"

  # load overrides needed for v2 tools
  # shellcheck source=/dev/null
  . /usr/local/buildpack/utils/v2/overrides.sh

  if [[ -f "$V2_TOOL" ]]; then
    # shellcheck source=/dev/null
    . "${V2_TOOL}"
  fi

  # prepare tool
  prepare_tool

  # cleanup
  if [[ $(is_root) -eq 0 ]]; then
    rm -rf /var/lib/apt/lists/* "${TEMP_DIR:?}"/*
  fi
}
