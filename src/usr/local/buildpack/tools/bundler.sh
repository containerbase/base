#!/bin/bash

set -e

check_command ruby

. /usr/local/buildpack/utils/ruby.sh

gem_install
gem_shell_wrapper

bundler --version
