#!/bin/bash

function npm_init () {
  temp_folder=$(mktemp -u)
  mkdir -p "${temp_folder}"
  export NPM_CONFIG_CACHE="${temp_folder}" NO_UPDATE_NOTIFIER=1 NPM_CONFIG_FUND=false
}

function npm_install () {
  local versioned_tool_path
  versioned_tool_path="$(create_versioned_tool_path)"

  # get semver => MAJOR, MINOR, PATCH
  check_semver "${TOOL_VERSION}"

  npm install "${TOOL_NAME}@${TOOL_VERSION}" --global --no-audit --prefix "$versioned_tool_path" --cache "${NPM_CONFIG_CACHE}" 2>&1

  if [[ "${TOOL_NAME}" == "npm" && ${MAJOR} -lt 7 ]]; then
    # update to latest node-gyp to fully support python3
    "$versioned_tool_path/bin/npm" explore npm --global --prefix "$versioned_tool_path" -- npm install node-gyp@latest --no-audit --cache "${NPM_CONFIG_CACHE}" 2>&1
  fi
}

function npm_clean () {
  # Clean npm stuff
  rm -rf "$HOME/.cache" "${NPM_CONFIG_CACHE}" "$HOME/.npm/_logs"/*
}

# Helper function to link to a globally installed node
function prepare_global_config () {
  local prefix=${1}
  prepare_prefix "${prefix}"
  mkdir -p "${versioned_tool_path}/etc"
  echo "prefix = \"${prefix}\"" >> "${versioned_tool_path}/etc/npmrc"
}

# Helper function to link to a user installed node
function prepare_user_config () {
  local prefix=${1}
  if grep 'prefix' "${USER_HOME}/.npmrc"; then
    return
  fi

  prepare_prefix "${prefix}"
  echo "prefix = \"${prefix}\"" >> "${USER_HOME}/.npmrc"
  mkdir -p "${USER_HOME}/.npm/_logs"
  chown -R "${USER_ID}" "${prefix}" "${USER_HOME}/.npmrc" "${USER_HOME}/.npm"
  chmod -R g+w "${prefix}" "${USER_HOME}/.npmrc" "${USER_HOME}/.npm"
}

function prepare_prefix () {
  local prefix=${1}
  # npm 7 bug
  mkdir -p "${prefix}"/{bin,lib}
}
