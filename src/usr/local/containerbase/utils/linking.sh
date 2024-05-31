#!/bin/bash

# use this if custom env is required, creates a shell wrapper to /opt/containerbase/bin
function shell_wrapper () {
  local TARGET
  local SOURCE=$2
  local EXPORTS=$3
  local args=$4
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

  echo "${SOURCE} ${args} \"\$@\"" >> "$TARGET"

  set_file_owner "${TARGET}" 775
}

# use this for simple symlink to /opt/containerbase/bin
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
