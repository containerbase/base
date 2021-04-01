#!/bin/bash

set -e

check_command python
check_semver ${TOOL_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

POETRY_URL=https://raw.githubusercontent.com/python-poetry/poetry/master/get-poetry.py
tool_path=$(find_tool_path)

function update_env () {
  reset_tool_env
  export_tool_path "${1}/bin"
}

if [[ -z "${tool_path}" ]]; then
  INSTALL_DIR=$(get_install_dir)
  tool_path=${INSTALL_DIR}/${TOOL_NAME}/${TOOL_VERSION}
  export POETRY_HOME=${tool_path}

  mkdir -p ${tool_path}

  curl -sSL $POETRY_URL | python - --version ${TOOL_VERSION} --no-modify-path
  unset POETRY_HOME

  # fix execute for all [#150]
  chmod +x ${tool_path}/bin/poetry
fi

update_env ${tool_path}

poetry --version

if [[ $EUID -eq 0 ]]; then
  shell_wrapper poetry
fi
