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

# Gets the env file name of the given tool
function find_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  echo "$install_dir/env.d/${TOOL_NAME}.sh"
}

function export_tool_env () {
  local install_dir
  install_dir=$(get_install_dir)
  if [[ -z "${TOOL_NAME}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi
  export "${1}=${2}"
  echo export "${1}=\${${1}-${2}}" >> "$install_dir"/env.d/"${TOOL_NAME}".sh
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
    echo export PATH="\$PATH:$additional_path" >> "${install_dir}/env.d/${TOOL_NAME}.sh"
  else
    export PATH="$additional_path:$PATH"
    echo export PATH="$additional_path:\$PATH" >> "${install_dir}/env.d/${TOOL_NAME}.sh"
  fi
}

function setup_env_files () {
  # env helper, loads tool specific env
  local install_dir
  install_dir=$(get_install_dir)

  cat >> "$ENV_FILE" <<- EOM
export BUILDPACK=1 USER_NAME="${USER_NAME}" USER_ID="${USER_ID}" USER_HOME="${USER_HOME}"

env_dirs=("/usr/local" "/opt/buildpack" "\${USER_HOME}")

# openshift override unknown user home
if [ "\${EUID}" != 0 ]; then
  export HOME="\${USER_HOME}"
fi

for p in \${env_dirs[@]}; do
  if [ -d "\${p}/env.d" ]; then
    for i in "\${p}/env.d"/*.sh; do
      if [ -r \$i ]; then
        . \$i
      fi
    done
    unset i
  fi
done
unset p
unset env_dirs

EOM

  cat >> "${BASH_RC}" <<- EOM
if [[ -r "$ENV_FILE" && -z "${BUILDPACK+x}" ]]; then
  . $ENV_FILE
fi
EOM
}
