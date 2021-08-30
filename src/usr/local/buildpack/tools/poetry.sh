#!/bin/bash

set -e

check_command python
check_semver ${TOOL_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

POETRY_URL=https://raw.githubusercontent.com/python-poetry/poetry/master/install-poetry.py

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

  curl -sSL $POETRY_URL | python - --version ${TOOL_VERSION}
  unset POETRY_HOME

  # fix execute for all renovatebot/docker-buildpack#150
  chmod +x ${tool_path}/bin/poetry

  # fix uid/ fid #124
  if [[ $UID -eq 0 ]]; then
    [ -f "${tool_path}/lib/poetry/_vendor/py2.7/backports/entry_points_selectable.py" ] \
      && chown 0:0 ${tool_path}/lib/poetry/_vendor/py2.7/backports/entry_points_selectable.py
  fi
fi

update_env ${tool_path}

poetry --version

shell_wrapper poetry
