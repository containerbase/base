#!/bin/bash

function refreshenv () {
  if [[ -r "$ENV_FILE" ]]; then
    # shellcheck source=/dev/null
    . "$ENV_FILE"
  fi
}

function export_env () {
  local non_root_only=${3-false}

  if [[ "${non_root_only}" != 'false' ]]; then
    # shellcheck disable=SC2016
    echo 'if [ "${EUID}" != 0 ]; then' >> "$ENV_FILE"
  else
    export "${1}=${2}"
  fi

  echo export "${1}=\${${1}-${2}}" >> "$ENV_FILE"

  if [[ "${non_root_only}" != 'false' ]]; then
    echo 'fi' >> "$ENV_FILE"
  fi
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
  local non_root_only=${3-false}
  install_dir=$(get_install_dir)

  if [[ -z "${TOOL_NAME}" ]]; then
    echo "No TOOL_NAME defined - skipping: ${TOOL_NAME}" >&2
    exit 1;
  fi

  if [[ "${non_root_only}" != 'false' ]]; then
    # shellcheck disable=SC2016
    echo 'if [ "${EUID}" != 0 ]; then' >> "${install_dir}/env.d/${TOOL_NAME}.sh"
  else
    export "${1}=${2}"
  fi

  echo export "${1}=\${${1}-${2}}" >> "${install_dir}/env.d/${TOOL_NAME}.sh"

  if [[ "${non_root_only}" != 'false' ]]; then
    echo 'fi' >> "${install_dir}/env.d/${TOOL_NAME}.sh"
  fi

  set_file_owner "${install_dir}/env.d/${TOOL_NAME}.sh" 664
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
  set_file_owner "${install_dir}/env.d/${TOOL_NAME}.sh" 664
}

function setup_env_files () {
  # env helper, loads tool specific env
  cat >> "$ENV_FILE" <<- EOM
export CONTAINERBASE=1 USER_NAME="${USER_NAME}" USER_ID="${USER_ID}" USER_HOME="${USER_HOME}" CONTAINERBASE_ENV=1

env_dirs=("/usr/local" "/opt/containerbase" "\${USER_HOME}")

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
if [[ -r "$ENV_FILE" && -z "${CONTAINERBASE_ENV+x}" ]]; then
  . $ENV_FILE
fi
EOM
}
