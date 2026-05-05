#!/bin/bash

require_root

version_codename=$(get_distro)

install -m 0755 -d /etc/apt/keyrings
curl --retry 3 -fsSL -o /etc/apt/keyrings/git.asc \
  'http://keyserver.ubuntu.com/pks/lookup?op=get&search=0xF911AB184317630C59970973E363C90F8F1B6217'
chmod a+r /etc/apt/keyrings/git.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/git.asc] https://ppa.launchpadcontent.net/git-core/ppa/ubuntu ${version_codename} main" | tee /etc/apt/sources.list.d/git.list


# TODO: Only latest version available on launchpad :-/
#apt_install git=1:${TOOL_VERSION}*

apt_install git

# flutter workaround
# allow all, so it works in older git versions when ppa is not working
git config --system safe.directory "*"

[[ -n $SKIP_VERSION ]] || git --version
