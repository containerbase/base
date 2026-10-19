#!/bin/bash

# Tests the download proxy config locally: starts nginx with nginx.conf in a
# docker container on port 8099, checks downloads, redirects, encoded paths,
# npm and gem registry requests, the cache and the host allowlist, then prints
# the stats.
# Usage: .github/actions/download-proxy/test.sh (needs docker and curl)

set -e

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
logs="$(mktemp -d)"
name=containerbase-cdn-test
proxy=http://127.0.0.1:8099
failed=0

# removes the container and the log folder
# shellcheck disable=SC2329 # called by the EXIT trap
cleanup() {
  docker rm -f "${name}" > /dev/null 2>&1 || true
  rm -rf "${logs}"
}
trap cleanup EXIT

# the nginx image runs as root, so the log folder must be writable for it
chmod 777 "${logs}"

docker run -d --name "${name}" --network host \
  --tmpfs /var/cache/containerbase-cdn \
  -v "${logs}:/var/log/containerbase-cdn" \
  -v "${dir}:/etc/containerbase-cdn:ro" \
  nginx:stable nginx -c /etc/containerbase-cdn/nginx.conf -g "daemon off;" > /dev/null

# waits until the proxy answers
for _ in $(seq 1 30); do
  curl -s -o /dev/null "${proxy}/" && break
  sleep 1
done

# requests a path through the proxy and compares status and cache status
# usage: check <path> <expected status> [expected cache status] [accept header]
check() {
  local path="$1" status="$2" cache="${3:-}" accept="${4:-}"
  local result
  local args=(-s -o /dev/null -w '%{http_code} %header{x-cache-status}')
  if [ -n "${accept}" ]; then
    args+=(-H "Accept: ${accept}")
  fi
  result="$(curl "${args[@]}" "${proxy}/${path}")"
  local got_status="${result%% *}" got_cache="${result#* }"
  if [ "${got_status}" = "${status}" ] && { [ -z "${cache}" ] || [ "${got_cache}" = "${cache}" ]; }; then
    echo "ok   ${got_status} ${got_cache} ${path}"
  else
    echo "FAIL ${got_status} ${got_cache} ${path} (expected ${status} ${cache})"
    failed=1
  fi
}

# GitHub release asset, redirects to release-assets.githubusercontent.com
check github.com/nubjs/nub/releases/download/v0.9.3/nub-linux-x64.tar.gz.sha256 200 MISS
check github.com/nubjs/nub/releases/download/v0.9.3/nub-linux-x64.tar.gz.sha256 200 HIT
# two redirects
check github.com/containerbase/maven-prebuild/releases/latest/download/version 200
# encoded `%2F` in the release tag
check 'github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.8.3/checksums.txt' 200
# redirects to cdn.dl.k8s.io
check dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubectl.sha256 200
# lookup with a query string
check 'api.adoptium.net/v3/info/release_versions?architecture=x64&image_type=jdk&os=linux&page_size=1&release_type=ga&version=%5B21%2C22%29' 200
# npm packument, the abbreviated one for installs is a separate cache entry
check registry.npmjs.org/is-number 200 MISS
check registry.npmjs.org/is-number 200 HIT
check registry.npmjs.org/is-number 200 MISS 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
check registry.npmjs.org/is-number 200 HIT 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
# npm tarballs, npm drops the registry path prefix
check is-number/-/is-number-7.0.0.tgz 200 MISS
check is-number/-/is-number-7.0.0.tgz 200 HIT
check 'is-number/-/is-number-7.0.0.tgz?foo=bar' 200
check @types/node/-/node-24.0.0.tgz 200
# rubygems compact index and gem file
check rubygems.org/info/rake 200
check rubygems.org/gems/rake-13.0.0.gem 200
# missing file is passed through
check github.com/nubjs/nub/releases/download/v0.0.0-missing/nub-linux-x64.tar.gz 404
# host not in allowed-hosts.map
check example.com/ 403

echo ""
"${dir}/stats.sh" "${logs}/access.log"

exit "${failed}"
