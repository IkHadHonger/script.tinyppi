"""Explicit framing permissions; never trust a URL supplied by the iframe."""

import ipaddress
from urllib.parse import urlsplit


def trusted_origins(text: object, strict: bool = False) -> list[str]:
    result: list[str] = []
    if not isinstance(text, str):
        if strict:
            raise ValueError("expected addresses")
        return result
    for value in text.replace(",", " ").split():
        try:
            url = urlsplit(value)
            address = ipaddress.ip_address(url.hostname or "")
            # Explicit local/loopback/Tailscale IPs only. No DNS names,
            # wildcards, credentials or paths; no trust in rebinding domains.
            local = address.is_loopback or any(
                address in ipaddress.ip_network(net)
                for net in (
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    "100.64.0.0/10",
                    "fc00::/7",
                )
            )
            if (
                not local
                or address.is_unspecified
                or address.is_multicast
                or url.scheme not in ("http", "https")
                or url.username is not None
                or url.password is not None
                or url.path not in ("", "/")
                or url.query
                or url.fragment
            ):
                raise ValueError("invalid origin")
            port = url.port
            host = "[" + str(address) + "]" if address.version == 6 else str(address)
            origin = url.scheme + "://" + host
            if port is not None and port != (443 if url.scheme == "https" else 80):
                origin += ":" + str(port)
            if origin not in result:
                result.append(origin)
            if len(result) > 24:
                raise ValueError("too many origins")
        except ValueError:
            if strict:
                raise
            return []  # Fail closed on invalid settings.
    return result


def page_policy(base: str, text: object) -> str:
    origins = trusted_origins(text)
    ancestors = "frame-ancestors 'self'" + (" " + " ".join(origins) if origins else "")
    children = "frame-src 'self'" + (" " + " ".join(origins) if origins else "")
    return base.replace("frame-ancestors 'none'", ancestors) + "; " + children
