#!/bin/bash

function legacy_tool_install () {
  set -e

  check_command ruby

  # shellcheck source=/dev/null
  . /usr/local/buildpack/utils/ruby.sh

  gem_install
  gem_shell_wrapper

  bundler --version
}
