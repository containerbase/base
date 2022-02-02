#!/bin/bash

function refreshenv () {
  if [[ -r "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    . "$ENV_FILE"
  fi
}

function export_env () {
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> "$ENV_FILE"
}

function export_path () {
  export PATH="$1:$PATH"
  echo export PATH="$1:\$PATH" >> "$ENV_FILE"
}

function reset_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  if [[ -f "$install_dir/env.d/${TOOL_NAME}.sh" ]];then
    rm "$install_dir/env.d/${TOOL_NAME}.sh"
  fi
}

function find_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  echo "$install_dir/env.d/${TOOL_NAME}.sh"
}

function export_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> "$install_dir"/env.d/"${TOOL_NAME}".sh
}

function export_tool_path () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME+x}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export PATH="$1:$PATH"
  echo export PATH="$1:\$PATH" >> "$install_dir"/env.d/"${TOOL_NAME}".sh
}

function get_tool_version_env () {
  local tool=${1//-/_}
  tool=${tool^^}_VERSION
  echo "${tool}"
}
