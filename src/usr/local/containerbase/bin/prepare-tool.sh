#!/bin/bash

set -e


# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

require_root

TOOLS=( "$@" )
TOOL_PATH="/${CONTAINERBASE_DIR}/tools/v2"

# special case if only 'all' is given
if [ "$#" -eq 1 ] && [ "${TOOLS[0]}" == "all" ]; then
  TOOLS=()
  for i in "${TOOL_PATH}"/*.sh; do
    TOOLS+=( "$(basename "${i%%.*}")")
  done
fi

for tool in "${TOOLS[@]}"
do
  # TODO: find better way to reset env
  # shellcheck source=/dev/null
  . "/${CONTAINERBASE_DIR}/util.sh"
  prepare_tools "${tool}"
done
