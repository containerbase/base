#!/bin/bash

# Copies the logs of the download proxy and the size of its cache per host to
# a folder the job uploads as an artifact, to sum up the failing downloads and
# the cache sizes over many runs.
# Usage: collect.sh <folder>

set -e

out="${1:?folder}"
logs=/var/log/containerbase-cdn
cache=/var/cache/containerbase-cdn

# the proxy wasn't started, eg. the job failed before
if [ ! -f "${logs}/access.log" ]; then
  exit 0
fi

mkdir -p "${out}"
sudo cp "${logs}/access.log" "${logs}/error.log" "${out}/"
sudo chown "$(id -u):$(id -g)" "${out}"/*.log
# the whole cache, the hosts are only in the log
sudo du -sB1 "${cache}" | cut -f1 > "${out}/cache-bytes"
