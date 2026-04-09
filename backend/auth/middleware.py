"""Google OAuth authentication middleware.

Verifies Google ID tokens using only Python stdlib — no google-auth or
PyJWT dependency required. Fetches Google's public keys (JWKS), caches
them, and verifies RS256 signatures using the ssl/hashlib modules.

When AUTH_ENABLED=true, validates Google ID tokens and checks that the
authenticated email matches ALLOWED_EMAIL. When AUTH_ENABLED=false (default),
all requests pass through without authentication.
"""

from __future__ import annotations

import base64
import json
import struct
import time
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from fastapi import HTTPException, Request

from config import ALLOWED_EMAIL, AUTH_ENABLED, GOOGLE_CLIENT_ID

# Google's public key endpoints
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

# Cache keys for 1 hour (Google rotates roughly daily)
_cached_keys: dict[str, Any] = {}
_cached_keys_expiry: float = 0


@dataclass
class AuthUser:
    email: str
    user_id: str  # Google's stable 'sub' claim


def _b64url_decode(data: str) -> bytes:
    """Decode base64url (no padding) to bytes."""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def _fetch_google_keys() -> dict[str, Any]:
    """Fetch Google's JWKS and return as {kid: key_data} dict."""
    global _cached_keys, _cached_keys_expiry

    now = time.time()
    if _cached_keys and now < _cached_keys_expiry:
        return _cached_keys

    req = urllib.request.Request(GOOGLE_CERTS_URL)
    with urllib.request.urlopen(req, timeout=10) as resp:
        jwks = json.loads(resp.read())

    keys = {}
    for key in jwks.get("keys", []):
        if key.get("kty") == "RSA" and key.get("use") == "sig":
            keys[key["kid"]] = key

    _cached_keys = keys
    _cached_keys_expiry = now + 3600  # cache for 1 hour
    return keys


def _rsa_public_key_from_jwk(jwk: dict) -> tuple[int, int]:
    """Extract (n, e) integers from a JWK RSA public key."""
    n_bytes = _b64url_decode(jwk["n"])
    e_bytes = _b64url_decode(jwk["e"])
    n = int.from_bytes(n_bytes, "big")
    e = int.from_bytes(e_bytes, "big")
    return n, e


def _verify_rs256(message: bytes, signature: bytes, n: int, e: int) -> bool:
    """Verify an RS256 signature using raw RSA math (stdlib only).

    RS256 = RSASSA-PKCS1-v1_5 with SHA-256.
    """
    import hashlib

    # RSA verify: signature^e mod n
    sig_int = int.from_bytes(signature, "big")
    result_int = pow(sig_int, e, n)

    # Expected key length in bytes
    k = (n.bit_length() + 7) // 8
    result_bytes = result_int.to_bytes(k, "big")

    # PKCS#1 v1.5 padding: 0x00 0x01 [0xFF padding] 0x00 [DigestInfo] [hash]
    # DigestInfo for SHA-256:
    digest_info_prefix = bytes([
        0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
        0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
        0x00, 0x04, 0x20,
    ])

    expected_hash = hashlib.sha256(message).digest()
    expected_suffix = digest_info_prefix + expected_hash

    # Check PKCS#1 v1.5 structure
    if result_bytes[0] != 0x00 or result_bytes[1] != 0x01:
        return False

    # Find the 0x00 separator after the 0xFF padding
    separator_idx = result_bytes.index(0x00, 2)
    padding = result_bytes[2:separator_idx]
    if not all(b == 0xFF for b in padding):
        return False

    actual_suffix = result_bytes[separator_idx + 1:]
    return actual_suffix == expected_suffix


def _decode_and_verify_token(token: str) -> dict:
    """Decode and verify a Google ID token. Returns the claims dict.

    Raises HTTPException on any validation failure.
    """
    # Split JWT
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Malformed token")

    header_b64, payload_b64, sig_b64 = parts

    # Decode header to get kid
    try:
        header = json.loads(_b64url_decode(header_b64))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token header")

    if header.get("alg") != "RS256":
        raise HTTPException(status_code=401, detail=f"Unsupported algorithm: {header.get('alg')}")

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token missing key ID")

    # Fetch Google's public keys
    try:
        keys = _fetch_google_keys()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch Google keys: {exc}")

    jwk = keys.get(kid)
    if not jwk:
        # Keys may have rotated — clear cache and retry once
        global _cached_keys_expiry
        _cached_keys_expiry = 0
        try:
            keys = _fetch_google_keys()
        except Exception:
            pass
        jwk = keys.get(kid)
        if not jwk:
            raise HTTPException(status_code=401, detail="Token signed with unknown key")

    # Verify signature
    message = f"{header_b64}.{payload_b64}".encode()
    signature = _b64url_decode(sig_b64)
    n, e = _rsa_public_key_from_jwk(jwk)

    if not _verify_rs256(message, signature, n, e):
        raise HTTPException(status_code=401, detail="Invalid token signature")

    # Decode and validate claims
    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Check issuer
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise HTTPException(status_code=401, detail=f"Invalid issuer: {claims.get('iss')}")

    # Check audience
    if claims.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=401,
            detail="Token audience mismatch",
        )

    # Check expiration (with 5 min tolerance for clock skew)
    now = time.time()
    if claims.get("exp", 0) < now - 300:
        raise HTTPException(status_code=401, detail="Token expired")

    # Check not-before (with tolerance)
    if claims.get("iat", 0) > now + 300:
        raise HTTPException(status_code=401, detail="Token issued in the future")

    return claims


async def require_auth(request: Request) -> AuthUser | None:
    """FastAPI dependency — validates the request is from the instance owner.

    When AUTH_ENABLED=false, returns None (no auth required).
    When AUTH_ENABLED=true, validates the Google ID token and checks the
    email matches ALLOWED_EMAIL.
    """
    if not AUTH_ENABLED:
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth_header.removeprefix("Bearer ")
    claims = _decode_and_verify_token(token)

    email = claims.get("email", "")
    user_id = claims.get("sub", "")

    if not email:
        raise HTTPException(status_code=401, detail="Token missing email claim")

    if not claims.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Email not verified")

    # Single-owner gate: only the allowed email can access this instance
    if ALLOWED_EMAIL and email.lower() != ALLOWED_EMAIL.lower():
        raise HTTPException(
            status_code=403,
            detail="You are not the owner of this instance",
        )

    return AuthUser(email=email, user_id=user_id)
