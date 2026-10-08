#!/bin/bash

# Tests the download proxy config locally: starts nginx with nginx.conf in a
# docker container on port 8099, checks downloads, redirects, encoded paths,
# the cache and the host allowlist, then prints the stats.
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
# usage: check <path> <expected status> [expected cache status]
check() {
  local path="$1" status="$2" cache="${3:-}"
  local result
  result="$(curl -s -o /dev/null -w '%{http_code} %header{x-cache-status}' "${proxy}/${path}")"
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
# missing file is passed through
check github.com/nubjs/nub/releases/download/v0.0.0-missing/nub-linux-x64.tar.gz 404
# host not in allowed-hosts.map
check example.com/ 403

echo ""
"${dir}/stats.sh" "${logs}/access.log"

exit "${failed}"
