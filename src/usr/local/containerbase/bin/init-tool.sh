#!/bin/bash

set -e

# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

function main() {
  local TOOL_NAME

  TOOL_NAME=${1}
  check TOOL_NAME true

  V2_TOOL="${CONTAINERBASE_DIR}/tools/v2/${TOOL_NAME}.sh"

  if [[ -f "$V2_TOOL" ]]; then
    # init v2 tool
    # load overrides needed for v2 tools
    # shellcheck source=/dev/null
    . "${CONTAINERBASE_DIR}/utils/v2/overrides.sh"
    # shellcheck source=/dev/null
    . "${V2_TOOL}"
    init_v2_tool
  else
    echo "No tool defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
}

main "$@"
