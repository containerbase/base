#!/bin/bash

# Prints how many requests and bytes the download proxy served from its cache,
# the size of the cache on disk and which hosts the builds downloaded from, to
# the job log and the job summary.
# Usage: stats.sh [access log] [cache folder], defaults to the ones on the runner.

set -e

# a dot as decimal separator in the sizes
export LC_ALL=C

log="${1:-/var/log/containerbase-cdn/access.log}"
cache="${2:-/var/cache/containerbase-cdn}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

# awk function formatting a byte count human readable
human='
  function human(bytes,    unit) {
    unit = 1
    while (bytes >= 1024 && unit < 5) { bytes /= 1024; unit++ }
    return unit == 1 ? sprintf("%d B", bytes) : sprintf("%.1f %s", bytes, substr("KiBMiBGiBTiB", unit * 3 - 5, 3))
  }
'

# reads the access log, with sudo when it belongs to root as on the runner
read_log() {
  if [ -r "${log}" ]; then
    cat "${log}"
  else
    sudo cat "${log}"
  fi
}

# prints the disk usage of the cache in bytes, with sudo when the nginx
# workers own its folders as on the runner
cache_size() {
  local size
  # du still prints a total when it can't read some folders
  size="$(du -sB1 "${cache}" 2> /dev/null)" || size="$(sudo du -sB1 "${cache}")"
  echo "${size}"
}

# the proxy wasn't started, eg. the job failed before
if [ ! -f "${log}" ]; then
  exit 0
fi

{
  echo "### Download proxy cache"
  echo ""
  echo "| Cache status | Requests | Bytes |"
  echo "| --- | --- | --- |"
  # bytes is the field before host=, see the log_format in nginx.conf
  read_log | awk "${human}"'
    {
      cache = ""; bytes = 0
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^host=/) bytes = $(i - 1)
        if ($i ~ /^cache=/) cache = substr($i, 7)
      }
      # nginx logs `-` for requests without a cache status
      if (cache == "" || cache == "-") cache = "none"
      requests[cache]++
      sent[cache] += bytes
    }
    END {
      for (cache in requests) {
        printf "| %s | %d | %s |\n", cache, requests[cache], human(sent[cache])
      }
    }
  ' | sort

  echo ""
  if [ -d "${cache}" ]; then
    cache_size | awk "${human}"'{ printf "Size on disk: %s\n", human($1) }'
  else
    echo "Size on disk: no cache folder"
  fi

  echo ""
  echo "### Download proxy hosts"
  echo ""
  echo "Only the requests the proxy saw in this job: build steps reused from the cache download nothing, so their hosts can be missing."
  echo ""
  echo "| Host | Requests | Cache hits | Bytes from cache | Bytes from upstream | Redirects to |"
  echo "| --- | --- | --- | --- | --- | --- |"
  # fields are host=, final= and cache=, with the bytes before host=, see the
  # log_format in nginx.conf
  read_log | awk "${human}"'
    {
      host = ""; final = ""; cache = ""; bytes = 0
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^host=/) { host = substr($i, 6); bytes = $(i - 1) }
        if ($i ~ /^final=/) final = substr($i, 7)
        if ($i ~ /^cache=/) cache = substr($i, 7)
      }
      # requests without a host, like a readiness check of `/`
      if (host == "") next
      requests[host]++
      if (cache == "HIT") hits[host]++
      # responses nginx makes itself, like a 403 for a host not allowed, have
      # no cache status and count for neither
      if (cache ~ /^(HIT|STALE|UPDATING|REVALIDATED)$/) cached[host] += bytes
      if (cache ~ /^(MISS|EXPIRED|BYPASS)$/) upstream[host] += bytes
      if (final != "" && final != host && index(targets[host], final) == 0) {
        targets[host] = targets[host] (targets[host] == "" ? "" : ", ") final
      }
    }
    END {
      for (host in requests) {
        printf "| %s | %d | %d | %s | %s | %s |\n", host, requests[host], hits[host], human(cached[host]), human(upstream[host]), targets[host]
      }
    }
  ' | sort
} | tee -a "${summary}"
