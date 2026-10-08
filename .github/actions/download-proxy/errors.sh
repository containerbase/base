#!/bin/bash

# Prints what the download proxy rejected or failed to fetch, so a missing
# host in allowed-hosts.map shows up in the job log.

set -e

echo "::group::Download proxy errors"
sudo cat /var/log/containerbase-cdn/error.log || true
sudo grep -E '" (403|5[0-9]{2}) ' /var/log/containerbase-cdn/access.log || true
echo "::endgroup::"
