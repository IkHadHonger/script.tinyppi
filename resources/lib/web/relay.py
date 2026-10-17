# SPDX-License-Identifier: AGPL-3.0-or-later
"""Opt-in TinyPPI relay with narrowly scoped player controls, never arbitrary proxying."""

from __future__ import annotations

import contextlib
import http.client
import ipaddress
import json
import os
import re
import socket
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from web.values import Unchecked

_TAILNET = ipaddress.ip_network("100.64.0.0/10")
_READS = {
    "/api/state": {""},
    "/api/jellyfin/local": {""},
    "/api/art": {"kind", "v"},
    "/api/jellyfin/art": {"item", "kind"},
}
_MAX_BYTES = 4 * 1024 * 1024


def valid_origin(origin: str, allowed: list[str]) -> bool:
    """Only explicitly trusted numeric tailnet addresses, never LAN services."""
    try:
        url = urlsplit(origin)
        return (origin in allowed and url.scheme == "http" and url.port == 8099
                and ipaddress.ip_address(url.hostname or "") in _TAILNET
                and not url.username and not url.password and not url.path
                and not url.query and not url.fragment)
    except ValueError:
        return False


def valid_path(path: str) -> bool:
    url = urlsplit(path)
    return (not url.scheme and not url.netloc and not url.fragment
            and url.path in _READS and len(path) <= 512
            and all(key in _READS[url.path] for key in parse_qs(url.query))
            and not any(ord(char) < 32 for char in path))


class Relay:
    """Credentials never leave the server except to their exact configured peer."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(4)

    def _load(self) -> dict[str, str]:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        if not isinstance(value, dict):
            raise ValueError("invalid relay configuration")
        return {key: token for key, token in value.items()
                if isinstance(key, str) and isinstance(token, str)}

    def origins(self, allowed: list[str]) -> list[str]:
        with self.lock:
            try:
                return [origin for origin in self._load() if valid_origin(origin, allowed)]
            except (OSError, ValueError):
                return []

    def save(self, origin: str, token: str, allowed: list[str]) -> None:
        if not valid_origin(origin, allowed) or not re.fullmatch(r"[A-Z0-9]{8,64}", token):
            raise ValueError("use a trusted Tailscale dashboard on port 8099 and its token")
        with self.lock:
            values = self._load()
            values[origin] = token
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(dir=self.path.parent, prefix=".relay-")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as output:
                    json.dump(values, output)
                    output.flush()
                    os.fsync(output.fileno())
                os.chmod(name, 0o600)
                os.replace(name, self.path)
            finally:
                if os.path.exists(name):
                    os.unlink(name)

    def read(self, origin: str, path: str, allowed: list[str]) -> tuple[int, bytes, str]:
        if not valid_origin(origin, allowed) or not valid_path(path):
            return 403, b'{"error":"relay target not allowed"}', "application/json"
        return self._request(origin, path)

    def write(self, origin: str, path: str, payload: dict,
              allowed: list[str]) -> tuple[int, bytes, str]:
        keys = {"/api/command": {"action", "value"}, "/api/mode": {"mode"}}
        if (not valid_origin(origin, allowed) or path not in keys
                or not set(payload).issubset(keys[path])):
            return 403, b'{"error":"relay command not allowed"}', "application/json"
        name = payload.get("action" if path == "/api/command" else "mode")
        if not isinstance(name, str) or not name or len(name) > 64:
            return 400, b'{"error":"invalid command"}', "application/json"
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        if len(body) > 1024:
            return 400, b'{"error":"command too large"}', "application/json"
        # Never retry a write: a lost response does not mean it was not applied.
        return self._request(origin, path, body)

    def _request(self, origin: str, path: str,
                 body: bytes | None = None) -> tuple[int, bytes, str]:
        with self.lock:
            token = self._load().get(origin)
        if not token:
            return 409, b'{"error":"remote token required"}', "application/json"
        if not self.slots.acquire(blocking=False):
            return 503, b'{"error":"relay busy"}', "application/json"
        url = urlsplit(origin)
        connection = http.client.HTTPConnection(url.hostname or "", url.port, timeout=2)
        timer = None
        response = None
        try:
            # http.client neither follows redirects nor uses HTTP_PROXY / DNS here.
            connection.connect()
            peer = connection.sock

            def expire() -> None:
                # Keep the socket even after HTTPResponse detaches it. A socket
                # timeout alone does not bound a peer slowly dripping headers.
                if peer is not None:
                    with contextlib.suppress(OSError):
                        peer.shutdown(socket.SHUT_RDWR)

            timer = threading.Timer(3, expire)
            timer.daemon = True
            timer.start()
            deadline = time.monotonic() + 3
            headers = {"X-TinyPPI-Token": token, "Connection": "close"}
            if body is None:
                connection.request("GET", path, headers=headers)
            else:
                headers["Content-Type"] = "application/json"
                connection.request("POST", path, body=body, headers=headers)
            response = connection.getresponse()
            if response.status == 401:
                return 409, b'{"error":"remote token required"}', "application/json"
            if response.status == 403:
                return 403, b'{"error":"remote control disabled or forbidden"}', "application/json"
            if response.status in (400, 429):
                return response.status, b'{"error":"remote command refused"}', "application/json"
            if response.status != 200:
                return 502, b'{"error":"remote unavailable"}', "application/json"
            content_type = response.getheader("Content-Type", "").split(";")[0]
            is_art = urlsplit(path).path in ("/api/art", "/api/jellyfin/art")
            if content_type not in ({"image/jpeg", "image/png", "image/webp"} if is_art
                                    else {"application/json"}):
                raise ValueError("unexpected response type")
            chunks = bytearray()
            while len(chunks) <= _MAX_BYTES:
                if time.monotonic() >= deadline:
                    raise TimeoutError("relay deadline")
                chunk = response.read1(min(65536, _MAX_BYTES + 1 - len(chunks)))
                if not chunk:
                    break
                chunks.extend(chunk)
            if len(chunks) > _MAX_BYTES:
                raise ValueError("oversized response")
            if not is_art:
                value: Unchecked = json.loads(chunks)
                if not isinstance(value, dict):
                    raise ValueError("invalid remote data")
                chunks = bytearray(json.dumps(value).encode("utf-8"))
            return 200, bytes(chunks), content_type
        except (OSError, ValueError, http.client.HTTPException):
            return 502, b'{"error":"remote unavailable"}', "application/json"
        finally:
            if timer is not None:
                timer.cancel()
            if response is not None:
                response.close()
            connection.close()
            self.slots.release()
