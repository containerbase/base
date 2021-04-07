#!/usr/bin/env bash

set -e

require_root
check_semver ${TOOL_VERSION}

if [[ ! "${MAJOR}" || ! "${MINOR}" || ! "${PATCH}" ]]; then
  echo Invalid version: ${TOOL_VERSION}
  exit 1
fi

echo "max-jobs = auto" | tee -a /tmp/nix.conf >/dev/null
echo "trusted-users = root ${USER_NAME}" | tee -a /tmp/nix.conf >/dev/null

installer_options=(
  --nix-extra-conf-file /tmp/nixd.conf
)

curl -sSL https://nixos.org/releases/nix/nix-$TOOL_VERSION/nix-$TOOL_VERSION-x86_64-linux.tar.xz --output nix.txz
tar xJf nix.txz
rm nix.txz

mkdir -m 0755 /etc/nix
chown -R ${USER_ID} /etc/nix
echo "sandbox = false" > /etc/nix/nix.conf

mkdir -m 0755 /nix
chown -R ${USER_ID} /nix

su ${USER_NAME} -c '"./nix-${TOOL_VERSION}-x86_64-linux/install" "${installer_options[@]}"'
ln -s /nix/var/nix/profiles/default/etc/profile.d/nix.sh /etc/profile.d/

rm -r nix-${TOOL_VERSION}-x86_64-linux*

export_path "/home/${USER_NAME}/.nix-profile/bin"
export_env NIX_PATH /nix/var/nix/profiles/per-user/${USER_NAME}/channels

nix-collect-garbage --delete-old
nix-store --optimise
nix-store --verify --check-contents

nix --version
