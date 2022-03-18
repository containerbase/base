#!/bin/bash

# use this if custom env is required, creates a shell wrapper to /usr/local/bin
function shell_wrapper () {
  local FILE
  FILE="$(get_bin_path)/${1}"
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
  # make it writable for the owner and the group
  chmod 775 "$FILE"
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
  cat > "$TARGET" <<- EOM
#!/bin/bash

${SOURCE} "\$@"
EOM
  # make it writable for the owner and the group
  chmod 775 "$FILE"
}
