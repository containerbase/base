#!/bin/bash

# defines the location of the env file that gets sourced for every command
export ENV_FILE=/usr/local/etc/env
# defines the location of the global bashrc
export BASH_RC=/etc/bash.bashrc
# defines the root directory where tools will be installed
export ROOT_DIR=/usr/local
# defines the directory where shims to tools will be installed
export BIN_DIR=/usr/local/bin
export LIB_DIR=/usr/local/lib
# defines the directory where user tools will be installed
# shellcheck disable=SC2153
export USER_HOME="/home/${USER_NAME}"
# defines the umask for folders created by the root
export ROOT_UMASK=755
# defines the umask fo folders created by the user
export USER_UMASK=775
# defines the cache folder for downloaded tools, if empty no cache will be used
export CONTAINERBASE_CACHE_DIR=${CONTAINERBASE_CACHE_DIR}
# defines the max amount of filled space (in percent from 0-100) that is allowed
# before the installation tries to free space by cleaning the cache folder
# If empty, then cache cleanup is disabled
export CONTAINERBASE_MAX_ALLOCATED_DISK=${CONTAINERBASE_MAX_ALLOCATED_DISK}
# defines the temp directory that will be used when the cache is not active
# it is used for all downloads and will be cleaned up after each install
export TEMP_DIR=/tmp

# used to source helper from tools
export CONTAINERBASE_DIR=/usr/local/containerbase

# Used to find matching tool downloads
ARCHITECTURE=$(uname -p)
export ARCHITECTURE
