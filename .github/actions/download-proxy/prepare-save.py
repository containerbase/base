"""Prepares the `cdn` cache of the download proxy for saving.

Copies the cache files this job requested to <folder>, so the saved cache only
has what the test still needs, and writes `bytes` (their size) and
`new-bytes` (what the job downloaded into the `cdn` cache) to GITHUB_OUTPUT.
nginx names a cache file after the md5 of its key, see `proxy_cache_key` and
`proxy_cache_path` in nginx.conf.

Usage: python3 -I prepare-save.py <access log> <cache folder> <folder>
"""

import hashlib
import os
import re
import shutil
import sys

# the fields of the `cdn` log_format in nginx.conf
LINE = re.compile(
    r'"(?P<method>\S+) (?P<uri>\S+) [^"]*" (?P<status>\d+) (?P<bytes>\d+) '
    r'.* cache=(?P<cache>\S+) zone=(?P<zone>\S+) .* accept="(?P<accept>[^"]*)"$'
)
# cache statuses with a file in the cache
CACHED = {'HIT', 'MISS', 'EXPIRED', 'STALE', 'UPDATING', 'REVALIDATED'}
DOWNLOADED = {'MISS', 'EXPIRED'}


def cache_path(cache, key):
    """The file nginx keeps `key` in, with `levels=1:2`."""
    digest = hashlib.md5(key.encode()).hexdigest()
    return os.path.join(cache, digest[-1], digest[-3:-1], digest)


def main():
    log, cache, out = sys.argv[1:4]
    keys = set()
    new_bytes = 0
    with open(log, encoding='utf-8', errors='replace') as f:
        for line in f:
            m = LINE.search(line.rstrip('\n'))
            if not m or m['zone'] != 'cdn' or m['status'] != '200':
                continue
            if m['cache'] not in CACHED:
                continue
            # nginx logs a missing header as `-`
            accept = '' if m['accept'] == '-' else m['accept']
            keys.add(f'{m["uri"]} {accept}')
            if m['cache'] in DOWNLOADED:
                new_bytes += int(m['bytes'])

    files = 0
    size = 0
    for key in keys:
        src = cache_path(cache, key)
        if not os.path.isfile(src):
            continue
        dst = os.path.join(out, os.path.relpath(src, cache))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        # a hard link on the same file system, a copy otherwise
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
        files += 1
        size += os.path.getsize(src)

    print(f'{files} of {len(keys)} requested files, {size} bytes, '
          f'{new_bytes} bytes downloaded by this job')
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output, 'a', encoding='utf-8') as f:
            f.write(f'files={files}\nbytes={size}\nnew-bytes={new_bytes}\n')


if __name__ == '__main__':
    main()
