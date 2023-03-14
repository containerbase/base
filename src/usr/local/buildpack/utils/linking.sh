#!/bin/bash

# use this if custom env is required, creates a shell wrapper to /usr/local/bin
function shell_wrapper () {
  local TARGET
  local SOURCE=$2
  local EXPORTS=$3
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

if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
  . $ENV_FILE
fi
EOM

  if [ -n "$EXPORTS" ]; then
    echo "export $EXPORTS" >> "$TARGET"
  fi

  echo "${SOURCE} \"\$@\"" >> "$TARGET"

  # make it writable for the owner and the group
  if [[ -O "$TARGET" ]] && [ "$(stat --format '%a' "${TARGET}")" -ne 775 ] ; then
    # make it writable for the owner and the group only if we are the owner
    chmod 775 "$TARGET"
  fi
  # make it writable for the default user
  if [[ -O "$TARGET" ]] && [ "$(stat --format '%u' "${TARGET}")" -eq "0" ] ; then
    # make it writable for the owner and the group only if we are the owner
    chown "${USER_ID}" "$TARGET"
  fi
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
