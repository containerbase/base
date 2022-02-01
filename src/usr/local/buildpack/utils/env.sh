#!/bin/bash

# Will create the env file that is responsible to load the global env and all tool envs
# and makes them available to the executing command
function setup_environment () {
  local env_path
  env_path=$(get_env_path)

  # check that the user vars are actually set
  check USER_NAME
  check USER_ID

  # env helper, loads tool specific env
  create_folder "$(dirname "$ENV_FILE")"
  cat >> "$ENV_FILE" <<- EOM
export BUILDPACK=1 USER_NAME="${USER_NAME}" USER_ID="${USER_ID}" USER_HOME="/home/${USER_NAME}"

# openshift override unknown user home
if [ "\${EUID}" != 0 ]; then
  export HOME="\${USER_HOME}"
fi

if [ -d "${env_path}" ]; then
  for i in "${env_path}"/*.sh; do
    if [ -r \$i ]; then
      . \$i
    fi
  done
  unset i
fi
EOM
  chmod +x "${ENV_FILE}"

  create_folder "$(dirname "$BASH_RC_FILE")"
  cat >> "${BASH_RC_FILE}" <<- EOM
if [[ -r "$ENV_FILE" && -z "${BUILDPACK}" ]]; then
  . $ENV_FILE
fi
EOM

  # set the default bin path in the env
  export_path "$(get_bin_path)"
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

function export_tool_env () {
  local additional_path=$1
  local install_dir

  install_dir=$(get_install_dir)

  if [[ -z "${TOOL_NAME}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  export "${additional_path}=${2}"
  echo export "${additional_path}=\${${additional_path}-${2}}" >> "$install_dir/env.d/${TOOL_NAME}".sh
}

function export_tool_path () {
  local additional_path=$1
  local add_to_end=${2:false}
  local install_dir

  install_dir=$(get_install_dir)

  if [[ -z "${TOOL_NAME}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  if [ "${add_to_end}" = true ]; then
    export PATH="$PATH:$additional_path"
    echo export PATH="\$PATH:$additional_path" >> "${install_dir}/env.d/${TOOL_NAME}".sh
  else
    export PATH="$additional_path:$PATH"
    echo export PATH="$additional_path:\$PATH" >> "${install_dir}/env.d/${TOOL_NAME}".sh
  fi
}
