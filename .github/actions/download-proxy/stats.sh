#!/bin/bash

# Prints how many requests the download proxy served from its cache and which
# hosts the builds downloaded from, to the job log and the job summary.
# Usage: stats.sh [access log], defaults to the log on the runner.

set -e

log="${1:-/var/log/containerbase-cdn/access.log}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

# reads the access log, with sudo when it belongs to root as on the runner
read_log() {
  if [ -r "${log}" ]; then
    cat "${log}"
  else
    sudo cat "${log}"
  fi
}

# the proxy wasn't started, eg. the job failed before
if [ ! -f "${log}" ]; then
  exit 0
fi

{
  echo "### Download proxy cache"
  echo ""
  echo "| Cache status | Requests |"
  echo "| --- | --- |"
  read_log | grep -o 'cache=[A-Z]*' | sort | uniq -c | while read -r count status; do
    status="${status#cache=}"
    echo "| ${status:-none} | ${count} |"
  done

  echo ""
  echo "### Download proxy hosts"
  echo ""
  echo "Only the requests the proxy saw in this job: build steps reused from the cache download nothing, so their hosts can be missing."
  echo ""
  echo "| Host | Requests | Cache hits | Redirects to |"
  echo "| --- | --- | --- | --- |"
  # fields are host=, final= and cache=, see the log_format in nginx.conf
  read_log | awk '
    {
      host = ""; final = ""; cache = ""
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^host=/) host = substr($i, 6)
        if ($i ~ /^final=/) final = substr($i, 7)
        if ($i ~ /^cache=/) cache = substr($i, 7)
      }
      # requests without a host, like a readiness check of `/`
      if (host == "") next
      requests[host]++
      if (cache == "HIT") hits[host]++
      if (final != "" && final != host && index(targets[host], final) == 0) {
        targets[host] = targets[host] (targets[host] == "" ? "" : ", ") final
      }
    }
    END {
      for (host in requests) {
        printf "| %s | %d | %d | %s |\n", host, requests[host], hits[host], targets[host]
      }
    }
  ' | sort
} | tee -a "${summary}"
