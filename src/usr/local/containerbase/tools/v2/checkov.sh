#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function install_tool () {
  local python_version
  local python_minor_version
  python_version=$(get_tool_version python)
  python_minor_version=$(get_python_minor_version "${python_version}")

  if [[ "${python_minor_version}" == "3.7" ]]; then
    # checkov <2.5 needs a workaround openai https://github.com/openai/openai-python/issues/1263
    install_python_tool openai==1.14.1
  else
    install_python_tool
  fi
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || checkov --version
}
