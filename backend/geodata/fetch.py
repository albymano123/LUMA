"""
Reliable downloads for the map-data build (used by the Docker image).

    python -m geodata.fetch URL DESTINATION [--min-bytes N]

Retries transient failures with a growing pause, resumes nothing (a partial
file is thrown away), and refuses a file that is shorter than the server said
it would be, or smaller than `--min-bytes`. A truncated download would
otherwise only show up later as an unreadable-extract error deep inside the
database build.
"""

import argparse
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

USER_AGENT = "LumaPath-build/1.0 (+https://github.com/albymano123/LUMA)"
CHUNK = 1 << 20


class DownloadError(RuntimeError):
    pass


def _once(url, destination, timeout, min_bytes):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    partial = destination + ".part"

    with urllib.request.urlopen(request, timeout=timeout) as response:
        expected = response.headers.get("Content-Length")
        expected = int(expected) if expected and expected.isdigit() else None
        written = 0

        with open(partial, "wb") as file:
            while True:
                block = response.read(CHUNK)

                if not block:
                    break

                file.write(block)
                written += len(block)

    if expected is not None and written != expected:
        raise DownloadError(f"incomplete download: got {written} of {expected} bytes")

    if written < min_bytes:
        raise DownloadError(f"file is only {written} bytes, expected at least {min_bytes}")

    os.replace(partial, destination)

    return written


def download(url, destination, retries=6, timeout=60, min_bytes=1, pause=5, sleep=time.sleep):
    """Downloads `url` to `destination`; returns the size in bytes.

    Raises DownloadError once every attempt has failed, naming the last cause.
    """

    os.makedirs(os.path.dirname(os.path.abspath(destination)), exist_ok=True)
    last = None

    for attempt in range(1, retries + 1):
        try:
            size = _once(url, destination, timeout, min_bytes)
            print(f"Downloaded {url} ({size / 1e6:.1f} MB)", flush=True)

            return size
        except urllib.error.HTTPError as error:
            last = f"HTTP {error.code} {error.reason}"

            # A missing or forbidden file will not fix itself.
            if error.code in (400, 401, 403, 404, 410):
                break
        except (urllib.error.URLError, OSError, DownloadError, TimeoutError) as error:
            last = str(getattr(error, "reason", None) or error)

        print(f"  attempt {attempt}/{retries} failed: {last}", flush=True)

        if attempt < retries:
            sleep(pause * attempt)

    partial = destination + ".part"

    if os.path.exists(partial):
        os.remove(partial)

    raise DownloadError(f"could not download {url}: {last}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url")
    parser.add_argument("destination")
    parser.add_argument("--min-bytes", type=int, default=1)
    parser.add_argument("--retries", type=int, default=6)
    args = parser.parse_args(argv)

    try:
        download(args.url, args.destination, retries=args.retries, min_bytes=args.min_bytes)
    except DownloadError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    return 0


def free_disk_mb(path):
    return shutil.disk_usage(path).free / 1e6


if __name__ == "__main__":
    sys.exit(main())
