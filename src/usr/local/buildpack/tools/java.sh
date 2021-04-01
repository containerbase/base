#!/bin/bash

set -e

require_root
check_semver $TOOL_VERSION

apt_install openjdk-${MAJOR}-jdk-headless

java -version
