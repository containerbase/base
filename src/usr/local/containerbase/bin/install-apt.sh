#!/bin/bash

set -e

# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

require_root

apt_install "$@"

# cleanup
rm -rf /var/lib/apt/lists/* /var/log/dpkg.* /var/log/apt
