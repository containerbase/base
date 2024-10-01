#!/bin/bash

set -e


# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

require_root
prepare_tools "${@}"
