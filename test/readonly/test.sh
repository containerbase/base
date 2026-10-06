#!/bin/bash

# Runs containerbase with a read-only root file system and a tmpfs `/tmp`, like
# `docker run --read-only`. Builds `test/readonly/Dockerfile` on top of
# `containerbase/test` (built by `pnpm test:docker`).
#
# Usage: test.sh [docker build args] [-- docker run args]
# eg. `test.sh --network host --build-arg BASE_IMAGE=<image> -- --network host`

set -euo pipefail

image=containerbase/test-readonly

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

  # installing tools needs a writable `/opt/containerbase` and isn't supported yet,
  # use a version that isn't installed yet
  if output=$(run --user "${user}" "${image}" install-tool flux 0.27.2 2>&1); then
    echo "install-tool should fail on a read-only file system"
    exit 1
  fi
  echo "${output}"
  grep 'EROFS: read-only file system' > /dev/null <<< "${output}"
done

echo "--- read-only tests passed"
