#!/bin/bash

set -e

# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

require_arch
require_distro
require_user
require_tool "$@"


TOOL="${CONTAINERBASE_DIR}/tools/${TOOL_NAME}.sh"
V2_TOOL="${CONTAINERBASE_DIR}/tools/v2/${TOOL_NAME}.sh"

if [[ -f "$V2_TOOL" ]]; then
  # install v2 tool
  install_v2_tool "${V2_TOOL}"
elif [[ -f "$TOOL" ]]; then
  echo "Installing v1 tool ${TOOL_NAME} v${TOOL_VERSION}"
  # shellcheck source=/dev/null
  . "$TOOL"
else
  echo "No tool defined - skipping: ${TOOL_NAME}" >&2
  exit 1;
fi
