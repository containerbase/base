#!/bin/bash

# use this if custom env is required, creates a shell wrapper to /usr/local/bin
function shell_wrapper () {
  local TARGET
  local SOURCE=$2
  TARGET="$(get_bin_path)/${1}"
  if [[ -z "$SOURCE" ]]; then
    SOURCE=$(command -v "${1}")
  fi
  if [[ -d "$SOURCE" ]]; then
    SOURCE=$SOURCE/${1}
  fi
  check SOURCE true
  check_command "$SOURCE"

  cat > "$TARGET" <<- EOM
#!/bin/bash

if [[ -r "$ENV_FILE" && -z "${BUILDPACK+x}" ]]; then
  . $ENV_FILE
fi

${SOURCE} "\$@"
EOM
  # make it writable for the owner and the group
  chmod 775 "$TARGET"
}

# use this for simple symlink to /usr/local/bin
function link_wrapper () {
  local TARGET
  local SOURCE=$2
  TARGET="$(get_bin_path)/${1}"
  if [[ -z "$SOURCE" ]]; then
    SOURCE=$(command -v "${1}")
  fi
  if [[ -d "$SOURCE" ]]; then
    SOURCE=$SOURCE/${1}
  fi
  check_command "$SOURCE"
  ln -sf "$SOURCE" "$TARGET"
}
