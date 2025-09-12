#!/bin/bash

set -e

# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

function main() {
  local tool=${1}
  local version=${2}

  export "TOOL_NAME=${tool}" "TOOL_VERSION=${version}"
  # compability fallback
  export "$(get_tool_version_env "${tool}")=${version}"

  # shellcheck source=/dev/null
  . "${CONTAINERBASE_DIR}/tools/${tool}.sh"
}

main "$@"
