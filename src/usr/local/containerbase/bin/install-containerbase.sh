#!/bin/bash

set -e

# USER_NAME and USER_ID need to be defined as the
# decision which paths are used are based on this information
if [[ -z "${USER_NAME}" ]]; then
  export USER_NAME=ubuntu
  echo "No USER_NAME defined - using: ${USER_NAME}"
fi

if [[ -z "${USER_ID}" ]]; then
  export USER_ID=1000
  echo "No USER_ID defined - using: ${USER_ID}"
fi

if [[ -z "${PRIMARY_GROUP_ID}" ]]; then
  export PRIMARY_GROUP_ID=0
  echo "No PRIMARY_GROUP_ID defined - using: ${PRIMARY_GROUP_ID}"
fi

# shellcheck source=/dev/null
. /usr/local/containerbase/util.sh

if [[ -n "${BASH_ENV}" && "${BASH_ENV}" != "${ENV_FILE}" ]]; then
  echo "Wrong BASH_ENV defined - skipping: ${BASH_ENV}"
  exit 1;
fi

# no duplicate installs
if [[ -n "${CONTAINERBASE_ENV+x}" ]]; then
  echo "CONTAINERBASE_ENV defined - skipping: ${CONTAINERBASE_ENV}"
  exit 1;
fi

require_arch
require_distro
require_root

setup_env_files

echo "APT::Install-Recommends \"false\";" | tee -a /etc/apt/apt.conf.d/containerbase.conf
echo "APT::Get::Install-Suggests \"false\";" | tee -a /etc/apt/apt.conf.d/containerbase.conf

# happens on ubuntu noble
if grep 'ubuntu:x:1000:' /etc/passwd > /dev/null; then
  echo "User already exists, deleting" >&2
  userdel -r ubuntu
fi

# Set up user and home directory
createUser

# create env helper paths
mkdir /usr/local/env.d
su "${USER_NAME}" -c "mkdir -p \"/home/${USER_NAME}/\"{env.d,bin}"

if [[ "$PATH" =~ (^|:)"/home/${USER_NAME}/bin"(:|$) ]]; then
  echo "export PATH=\"/home/${USER_NAME}/bin:\${PATH}\"" >> "$ENV_FILE"
fi

# OpenShift
chmod -R g+w "/home/${USER_NAME}"

export_env DEBIAN_FRONTEND "noninteractive"
export_env LC_ALL "C.UTF-8"
export_env LANG "C.UTF-8"

# upgrade base packages
apt_upgrade

# install basic required packages
apt_install \
  ca-certificates \
  curl \
  dumb-init \
  gnupg \
  jq \
  libarchive-tools \
  openssh-client \
  unzip \
  xz-utils \
  zstd \
  ;

# check for /usr/local/share/ca-certificates/*.crt

if [[ "$(find /usr/local/share/ca-certificates/ -name "*.crt" -type f -printf '.' | wc -c)" -gt 0 ]]; then
  echo "Found user certs, calling update-ca-certificates"
  update-ca-certificates
fi

function link_tools () {
  ln -sf /usr/local/containerbase/bin/docker-entrypoint.sh /usr/local/sbin/docker-entrypoint.sh
  ln -sf /usr/local/containerbase/bin/install-apt.sh /usr/local/sbin/install-apt
  ln -sf /usr/local/containerbase/bin/containerbase-cli /usr/local/sbin/containerbase-cli
  ln -sf /usr/local/containerbase/bin/containerbase-cli /usr/local/sbin/install-gem
  ln -sf /usr/local/containerbase/bin/containerbase-cli /usr/local/sbin/install-npm
  ln -sf /usr/local/containerbase/bin/containerbase-cli /usr/local/sbin/install-tool
  ln -sf /usr/local/containerbase/bin/containerbase-cli /usr/local/sbin/prepare-tool

  containerbase-cli --version
}
link_tools


# do this at the end as we are overwriting certain env vars and functions
function prepare_v2_tools () {
  # setup directories for v2 tools
  # shellcheck source=/dev/null
  . /usr/local/containerbase/utils/v2/overrides.sh

  setup_directories

  # compability with current custom images
  ln -sf /usr/local/sbin/install-containerbase /usr/local/bin/install-containerbase
}
prepare_v2_tools

# cleanup
rm -rf /var/lib/apt/lists/* /var/log/dpkg.* /var/log/apt
