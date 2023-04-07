#!/bin/bash

# shellcheck source=/dev/null
. "$(get_buildpack_path)/utils/ruby.sh"

function link_tool () {
  post_install
  $SKIP_VERSION || bundler --version
}
