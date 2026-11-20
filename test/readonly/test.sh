#!/bin/bash

# Runs containerbase with a read-only root file system and a tmpfs `/tmp`, like
# `docker run --read-only`. Builds `test/readonly/Dockerfile` on top of
# `containerbase/test` (built by `pnpm test:docker`).
#
# Usage: test.sh [docker build args] [-- docker run args]
# eg. `test.sh --network host --build-arg BASE_IMAGE=<image> -- --network host`

set -euo pipefail

image=containerbase/test-readonly
# configured `CONTAINERBASE_TMP_DIR`, on the read-only root file system
tmp_dir=/var/cache/containerbase

build_args=()
run_args=()
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--" ]]; then
    shift
    run_args=("$@")
    break
  fi
  build_args+=("$1")
  shift
done

docker build --load --tag "${image}" "${build_args[@]}" test/readonly

# Runs the test image with a read-only root file system and a tmpfs `/tmp`,
# passing the `docker run` args after `--` and then the given arguments.
function run() {
  docker run --rm --read-only --tmpfs /tmp "${run_args[@]}" "$@"
}

for user in root 12021; do
  echo "--- user: ${user}"

  # reads the databases without writing
  output=$(run --user "${user}" "${image}" containerbase-cli list tools)
  echo "${output}"
  grep '^node ' > /dev/null <<< "${output}"

  # wrappers initialize their tool into `/tmp` on the first call
  run --user "${user}" "${image}" node --version
  run --user "${user}" "${image}" npm --version
  run --user "${user}" "${image}" flux --version

  # installing tools needs a writable `/opt/containerbase`, so it fails before
  # downloading anything, use a version that isn't installed yet
  if output=$(run --user "${user}" "${image}" install-tool flux 0.27.2 2>&1); then
    echo "install-tool should fail on a read-only file system"
    exit 1
  fi
  echo "${output}"
  grep "EROFS: can't write to" > /dev/null <<< "${output}"

  # a dry run writes nothing, so it works on a read-only file system
  run --user "${user}" "${image}" install-tool --dry-run flux 0.27.2

  # a dangling pointer, the version folder is gone, can't be installed again on
  # a read-only file system, the call fails with the write error and not with
  # `No such file or directory`
  if output=$(run --user "${user}" "${image}" helm version 2>&1); then
    echo "helm should fail with a missing version folder on a read-only file system"
    exit 1
  fi
  echo "${output}"
  grep "EROFS: can't write to" > /dev/null <<< "${output}"
  if grep 'No such file or directory' > /dev/null <<< "${output}"; then
    echo "the shim should not source the dangling pointer"
    exit 1
  fi

  # a configured tmp dir on the read-only root file system can't be created,
  # so the tools keep using a real `/tmp/containerbase` folder with a warning
  output=$(run --user "${user}" -e CONTAINERBASE_TMP_DIR="${tmp_dir}" "${image}" \
    bash -c 'node --version && containerbase-cli list tools && test ! -L /tmp/containerbase && test -d /tmp/containerbase' 2>&1)
  echo "${output}"
  grep '^node ' > /dev/null <<< "${output}"
  grep "keeping the default folder: ${tmp_dir} can't be created" > /dev/null <<< "${output}"

  # a writable tmpfs on the configured tmp dir, owned by the user and without
  # the sticky bit, is used through a `/tmp/containerbase` link
  output=$(run --user "${user}" -e CONTAINERBASE_TMP_DIR="${tmp_dir}" \
    --tmpfs "${tmp_dir}:uid=12021,mode=0755" "${image}" \
    bash -c 'node --version && npm --version && readlink /tmp/containerbase' 2>&1)
  echo "${output}"
  grep "^${tmp_dir}$" > /dev/null <<< "${output}"
  if grep 'keeping the default folder' > /dev/null <<< "${output}"; then
    echo "the configured tmp dir should be used"
    exit 1
  fi
done

echo "--- read-only tests passed"

# Runs the test image as the containerbase user with a read-only root file
# system and a tmpfs `/tmp`, with `/opt/containerbase` mounted from a host
# folder, passing the `docker run` args after the folder and then the
# given arguments.
function volume_run() {
  local dir="$1"
  shift
  run --user 12021 -v "${dir}:/opt/containerbase" "$@"
}

# Creates an empty host folder the containerbase user can write.
function volume_dir() {
  local dir
  dir=$(mktemp -d)
  chmod 0777 "${dir}"
  echo "${dir}"
}

# Removes a host folder, also the files the container wrote with another owner.
# The folder itself is given back to the host user first, as a copy made as
# root changes its owner too, and then `rmdir` fails in a sticky `/tmp`.
function volume_rm() {
  docker run --rm --user root -v "$1:/volume" --entrypoint bash "${image}" -c "rm -rf /volume/* /volume/.[!.]*; chown $(id -u):$(id -g) /volume"
  rmdir "$1"
}

volume=$(volume_dir)
copy=$(volume_dir)
trap 'rm -f "${volume}.list"; volume_rm "${volume}"; volume_rm "${copy}"' EXIT

echo "--- volume: empty /opt/containerbase"

# jq is restored by the init, git comes with the image and all other tools are
# restored by their first call, an image has no other state than its build-time list
# shellcheck disable=SC2016
volume_run "${volume}" "${image}" bash -c '
  set -ex
  test -d /opt/containerbase/tools/jq
  test -f /opt/containerbase/.tool.inst
  cmp /var/lib/containerbase/tool.inst /opt/containerbase/.tool.inst
  test -z "$(find /opt/containerbase/tools/node -mindepth 1 -type d)"
  node --version | grep -E "^v[0-9]+\."
  test -n "$(find /opt/containerbase/tools/node -mindepth 1 -type d)"
  git --version
  jq --version
  java -version
  python --version
  hashin --version
  test "$(cat /opt/containerbase/versions/node)" = "$(node --version | tr -d v)"
  containerbase-cli list tools | grep "^node "
  containerbase-cli list tools | grep "^hashin "
  # the version of the image is installed by its first call
  flux --version
  image_flux=$(grep -m1 "^i tool flux " /var/lib/containerbase/tool.inst | cut -d " " -f 4)
  test -d "/opt/containerbase/tools/flux/${image_flux}"
  # a version which is not in the list installs on the writable volume
  test ! -e /opt/containerbase/tools/jq/1.7.1
  install-tool jq 1.7.1
  test -d /opt/containerbase/tools/jq/1.7.1
  test "$(cat /opt/containerbase/versions/jq)" = 1.7.1
'

echo "--- volume: image update with another list"

# a second list moves flux back, the volume keeps what it has and the image wins
docker run --rm --user root --entrypoint cat "${image}" /var/lib/containerbase/tool.inst > "${volume}.list"
printf 'i tool flux 0.27.2\nc flux flux 0.27.2\nl flux flux 0.27.2\n' >> "${volume}.list"
# shellcheck disable=SC2016
volume_run "${volume}" -v "${volume}.list:/var/lib/containerbase/tool.inst:ro" "${image}" bash -c '
  set -ex
  cmp /var/lib/containerbase/tool.inst /opt/containerbase/.tool.inst
  flux --version | grep 0.27.2
  # nothing is removed, the version of the image before is still there
  test -n "$(find /opt/containerbase/tools/node -mindepth 1 -type d)"
  # the version of the image before and the one of the new list
  image_flux=$(grep -m1 "^i tool flux " /var/lib/containerbase/tool.inst | cut -d " " -f 4)
  test -d "/opt/containerbase/tools/flux/${image_flux}"
  test -d /opt/containerbase/tools/flux/0.27.2
  test "$(cat /opt/containerbase/versions/flux)" = 0.27.2
'

echo "--- volume: copy of /opt/containerbase"

# a copy of the folder of the image needs no init and no download, any
# download fails as all urls point to a closed port
docker run --rm --user root -v "${copy}:/volume" --entrypoint bash "${image}" -c 'cp -a /opt/containerbase/. /volume/'
mtime=$(stat -c %Y "${copy}/.tool.inst")
# shellcheck disable=SC2016
volume_run "${copy}" -e CONTAINERBASE_CDN= -e URL_REPLACE_0_FROM=https:// \
  -e URL_REPLACE_0_TO=http://127.0.0.1:9/ -e "LIST_MTIME=${mtime}" "${image}" bash -c '
  set -ex
  test "$(stat -c %Y /opt/containerbase/.tool.inst)" = "${LIST_MTIME}"
  node --version
  git --version
  jq --version
  java -version
  hashin --version
  flux --version
'

echo "--- volume tests passed"
