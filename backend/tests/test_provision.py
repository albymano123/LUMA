"""Download retries, integrity checks and database validation for the image build."""

import http.server
import sqlite3
import threading

import pytest

from geodata import provision
from geodata.build import _fresh_index
from geodata.fetch import DownloadError, download
from geodata.schema import DDL, SCHEMA_VERSION

PAYLOAD = b"x" * 5000


class Server:
    """Serves /file; the first `failures` requests fail, `truncate` cuts the body short."""

    def __init__(self, failures=0, status=500, truncate=False):
        outer = self
        self.requests = 0
        self.failures = failures

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                outer.requests += 1

                if outer.requests <= outer.failures:
                    self.send_response(status)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return

                self.send_response(200)
                self.send_header("Content-Length", str(len(PAYLOAD)))
                self.end_headers()
                self.wfile.write(PAYLOAD[:2000] if truncate else PAYLOAD)

        self.httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}/file"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def serve():
    servers = []

    def make(**kwargs):
        servers.append(Server(**kwargs))
        return servers[-1]

    yield make

    for server in servers:
        server.close()


def no_sleep(_seconds):
    pass


def test_download_succeeds(serve, tmp_path):
    server = serve()
    target = tmp_path / "a.bin"

    assert download(server.url, str(target), sleep=no_sleep) == len(PAYLOAD)
    assert target.read_bytes() == PAYLOAD


def test_download_retries_transient_server_errors(serve, tmp_path):
    server = serve(failures=2, status=503)

    download(server.url, str(tmp_path / "a.bin"), sleep=no_sleep)

    assert server.requests == 3


def test_download_does_not_retry_a_missing_file(serve, tmp_path):
    server = serve(failures=10, status=404)

    with pytest.raises(DownloadError, match="404"):
        download(server.url, str(tmp_path / "a.bin"), sleep=no_sleep)

    assert server.requests == 1


def test_truncated_download_is_rejected_and_leaves_no_file(serve, tmp_path):
    server = serve(truncate=True)
    target = tmp_path / "a.bin"

    with pytest.raises(DownloadError, match="incomplete|could not download"):
        download(server.url, str(target), retries=2, sleep=no_sleep)

    assert server.requests == 2
    assert not target.exists()
    assert not (tmp_path / "a.bin.part").exists()


def test_file_smaller_than_expected_is_rejected(serve, tmp_path):
    server = serve()

    with pytest.raises(DownloadError, match="at least"):
        download(server.url, str(tmp_path / "a.bin"), retries=1, min_bytes=10**6, sleep=no_sleep)


def make_database(path, ways=0, pois=0, version=SCHEMA_VERSION):
    connection = sqlite3.connect(path)
    connection.executescript(DDL)
    connection.executemany(
        "INSERT INTO ways VALUES (?,?,?,?,?,?,?,?)",
        [(i, "residential", "local", "unknown", None, "unknown", "unknown", b"") for i in range(ways)],
    )
    connection.executemany(
        "INSERT INTO pois VALUES (?,?,?,?,?,?,?,?,?)",
        [(i, f"node-{i}", "hospital", None, None, 0, 76.0, 10.0, None) for i in range(pois)],
    )
    connection.execute("INSERT INTO meta VALUES ('schema_version', ?)", (str(version),))
    connection.commit()
    connection.close()


def test_valid_database_passes(tmp_path):
    path = str(tmp_path / "ok.sqlite")
    make_database(path, ways=2000, pois=3)

    provision.validate_database(path)


def test_empty_database_is_rejected(tmp_path):
    path = str(tmp_path / "empty.sqlite")
    make_database(path, ways=0, pois=0)

    with pytest.raises(provision.ProvisionError, match="empty"):
        provision.validate_database(path)


def test_wrong_schema_version_is_rejected(tmp_path):
    path = str(tmp_path / "old.sqlite")
    make_database(path, ways=2000, pois=3, version=SCHEMA_VERSION + 1)

    with pytest.raises(provision.ProvisionError, match="schema"):
        provision.validate_database(path)


def test_non_database_file_is_rejected(tmp_path):
    path = tmp_path / "junk.sqlite"
    path.write_bytes(b"<html>not a database</html>" * 50)

    with pytest.raises(provision.ProvisionError):
        provision.validate_database(str(path))


def test_provision_from_prebuilt_gzip(serve, tmp_path, monkeypatch):
    import gzip

    source = tmp_path / "src.sqlite"
    make_database(str(source), ways=2000, pois=3)
    payload = gzip.compress(source.read_bytes())

    monkeypatch.setattr(provision, "download", lambda url, dest, **kw: open(dest, "wb").write(payload))

    out = tmp_path / "out" / "geo.sqlite"
    provision.provision(str(out), str(tmp_path / "work"), db_url="https://example.test/geo.sqlite.gz")

    assert out.exists()


def test_fresh_index_removes_a_file_backed_index(tmp_path):
    index = tmp_path / "nodes.idx"
    index.write_bytes(b"old entries")

    assert _fresh_index(f"sparse_file_array,{index}") == f"sparse_file_array,{index}"
    assert not index.exists()


def test_fresh_index_leaves_memory_indexes_alone():
    assert _fresh_index("flex_mem") == "flex_mem"
