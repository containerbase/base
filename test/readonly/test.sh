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
