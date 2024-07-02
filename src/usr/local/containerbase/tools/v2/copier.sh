#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/python.sh"

function install_tool () {
  # Some templates require the ability to use custom
  # Jinja extensions.
  install_python_tool 'copier-templates-extensions'
}

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || copier --version
}
