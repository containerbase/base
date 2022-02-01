#!/bin/bash

# use this if custom env is required, creates a shell wrapper to ${install_dir}/bin
function shell_wrapper () {
  local install_dir
  install_dir=$(get_install_dir)
  local tool_file
  tool_file="${install_dir}/bin/${1}"

  check_command "$1"
  cat > "$tool_file" <<- EOM
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
  chmod +x "$tool_file"
}

# use this for simple symlink to ${install_dir}/bin
function link_wrapper () {
  local install_dir
  local tool=$1
  local source=$2

  install_dir=$(get_install_dir)
  local target="${install_dir}/bin/${tool}"

  if [[ -z "$source" ]]; then
    source=$(command -v "${tool}")
  fi
  if [[ -d "$source" ]]; then
    source=$source/${tool}
  fi

  check_command "$source"
  ln -sf "$source" "$target"
}
