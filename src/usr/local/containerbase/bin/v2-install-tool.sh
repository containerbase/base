#!/bin/bash

set -e

# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

# shellcheck source=/dev/null
. "${CONTAINERBASE_DIR}/utils/v2/overrides.sh"

function main() {
  local mode=${1}
  local tool=${2}
  local version=${3:-}

  export "TOOL_NAME=${tool}"

  if [[ -n "${version}" ]]; then
    export "TOOL_VERSION=${version}"
    # compability fallback
    export "$(get_tool_version_env "${tool}")=${version}"
  fi

  # shellcheck source=/dev/null
  . "${CONTAINERBASE_DIR}/tools/v2/${tool}.sh"

  case "$mode" in
    prepare)
    prepare_tool
    ;;
    init)
    init_tool
    ;;
    check)
    check_tool_requirements
    ;;
    install)
    check_tool_requirements
    install_tool
    ;;
    link)
    check_tool_requirements
    link_tool
    ;;
    post-install)
    check_tool_requirements
    post_install
    ;;
    test)
    test_tool
    ;;
    uninstall)
    uninstall_tool
    ;;
  esac

}

main "$@"
