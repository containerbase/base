#!/bin/bash

# Runs containerbase with a read-only root file system and a tmpfs `/tmp`, like
# `docker run --read-only`, also with a volume at `/opt/containerbase`. Builds
# `test/readonly/Dockerfile` on top of `containerbase/test` (built by
# `pnpm test:docker`).
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
  run --user "${user}" "${image}" git --version

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

node_dir=/opt/containerbase/tools/node/24.22.1
php_dir=/opt/containerbase/tools/php/8.5.12
git_dir=/opt/containerbase/tools/git/2.56.0
volume=containerbase-test-readonly

# Removes the test volume, if it exists.
function remove_volume() {
  docker volume rm --force "${volume}" > /dev/null
}
trap remove_volume EXIT

# Runs the test image like `run` with the test volume at `/opt/containerbase`,
# `nocopy` keeps a new volume empty instead of docker filling it from the image.
function run_volume() {
  local nocopy=$1
  shift
  run --mount "type=volume,src=${volume},dst=/opt/containerbase${nocopy:+,volume-nocopy}" "$@"
}

# Runs `run_volume` and prints its combined output, also to stderr when it
# fails, so a failure inside `$(…)` shows its output.
function run_volume_output() {
  local out
  if ! out=$(run_volume "$@" 2>&1); then
    echo "${out}" >&2
    return 1
  fi
  echo "${out}"
}

# an empty volume as root, and a volume docker filled from the image as root
# and as the user, which owns the image's `/opt/containerbase`
for setup in "root nocopy" "root" "12021"; do
  read -r user nocopy <<< "${setup}"
  echo "--- volume: user ${user} ${nocopy:-filled by docker}"
  remove_volume

  # the first start restores the volume: build-time folders link to the
  # snapshot, `php` writes into its folder, so it's copied, `git` finds its
  # helpers through its real path in the snapshot
  output=$(run_volume_output "${nocopy}" --user "${user}" "${image}" bash -c "
    set -ex
    test -f /opt/containerbase/.restored
    test -L ${node_dir}
    test -d ${php_dir} && test ! -L ${php_dir}
    test -L ${git_dir}
    node --version && npm --version && php --version && flux --version
    git --version | grep -Fx 'git version 2.56.0'
    git --exec-path | grep -Fx \"\$(readlink -f ${git_dir})/libexec/git-core\"
    git ls-remote https://github.com/containerbase/base HEAD
    containerbase-cli list tools
  ")
  echo "${output}"
  grep 'restoring /opt/containerbase' > /dev/null <<< "${output}"
  grep '^node ' > /dev/null <<< "${output}"

  # a runtime install goes onto the volume
  run_volume "${nocopy}" --user "${user}" "${image}" install-tool flux 0.27.2

  # a second start with the same volume needs no restore and keeps it
  output=$(run_volume_output "${nocopy}" --user "${user}" "${image}" bash -c "
    set -ex
    test -d /opt/containerbase/tools/flux/0.27.2
    flux --version
  ")
  echo "${output}"
  grep '0\.27\.2' > /dev/null <<< "${output}"
  if grep 'restoring /opt/containerbase' > /dev/null <<< "${output}"; then
    echo "a restored volume should not be restored again"
    exit 1
  fi

  # the runtime tool can be uninstalled again
  run_volume "${nocopy}" --user "${user}" "${image}" bash -c "
    set -ex
    uninstall-tool flux 0.27.2
    test ! -e /opt/containerbase/tools/flux/0.27.2
    test -L ${node_dir}
  "
done

echo "--- read-only tests passed"
