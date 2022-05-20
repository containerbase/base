#!/bin/bash

# OVERWRITE:
#
# defines the root directory where tools will be installed
# shellcheck disable=SC2168,SC2034
export ROOT_DIR=/opt/buildpack

# get path location
DIR="${BASH_SOURCE%/*}"
if [[ ! -d "$DIR" ]]; then DIR="$PWD"; fi

# source the helper files
# shellcheck source=/dev/null
. "${DIR}/filesystem.sh"
# shellcheck source=/dev/null
. "${DIR}/defaults.sh"
