#!/bin/bash

# shellcheck source=/dev/null
. "$(get_containerbase_path)/utils/ruby.sh"

function link_tool () {
  post_install
  [[ -n $SKIP_VERSION ]] || pod --version --allow-root
}
