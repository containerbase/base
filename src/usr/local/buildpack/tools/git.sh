#!/bin/bash

set -e

require_root
VERSION_CODENAME=$(. /etc/os-release && echo ${VERSION_CODENAME})

echo "deb http://ppa.launchpad.net/git-core/ppa/ubuntu ${VERSION_CODENAME} main" | tee -a /etc/apt/sources.list.d/git.list
curl -sSL \
  'http://keyserver.ubuntu.com/pks/lookup?op=get&search=0xE1DD270288B4E6030699E45FA1715D88E1DF1F24' \
  | apt-key add -

# TODO: Only latest version available on launchpad :-/
#apt_install git=1:${TOOL_VERSION}*
apt_install git

git --version
