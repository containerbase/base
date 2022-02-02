#!/bin/bash

# use this if custom env is required, creates a shell wrapper to /usr/local/bin or /home/<user>/bin
function shell_wrapper () {
  local install_dir
  local FILE="${install_dir}/bin/${1}"
  install_dir=$(get_install_dir)
  check_command "$1"
  cat > "$FILE" <<- EOM
#!/bin/bash

if [[ -r "$ENV_FILE" && -z "${BUILDPACK+x}" ]]; then
  . $ENV_FILE
fi

if [[ "\$(command -v ${1})" == "$FILE" ]]; then
  echo Could not forward ${1}, probably wrong PATH variable. >&2
  echo PATH=\$PATH
  exit 1
fi

${1} "\$@"
EOM
  chmod +x "$FILE"
}

# use this for simple symlink to /usr/local/bin or /home/<user>/bin
function link_wrapper () {
  local install_dir
  local TARGET
  local SOURCE=$2
  install_dir=$(get_install_dir)
  TARGET="${install_dir}/bin/${1}"
  if [[ -z "$SOURCE" ]]; then
    SOURCE=$(command -v "${1}")
  fi
  if [[ -d "$SOURCE" ]]; then
    SOURCE=$SOURCE/${1}
  fi
  check_command "$SOURCE"
  ln -sf "$SOURCE" "$TARGET"
}
