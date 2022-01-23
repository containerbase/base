#!/usr/bin/env bash

set -e

require_root

# go suggests: git svn bzr mercurial
apt_install bzr mercurial
