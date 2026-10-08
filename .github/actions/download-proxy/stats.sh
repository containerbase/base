#!/bin/bash

# Prints how many requests the download proxy served from its cache, to the
# job log and the job summary.

set -e

log=/var/log/containerbase-cdn/access.log

# the proxy wasn't started, eg. the job failed before
if ! sudo test -f "${log}"; then
  exit 0
fi

{
  echo "### Download proxy cache"
  echo ""
  echo "| Cache status | Requests |"
  echo "| --- | --- |"
  sudo grep -o 'cache=[A-Z]*' "${log}" | sort | uniq -c | while read -r count status; do
    status="${status#cache=}"
    echo "| ${status:-none} | ${count} |"
  done
} | tee -a "${GITHUB_STEP_SUMMARY}"
