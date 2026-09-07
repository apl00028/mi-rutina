"""Contact secrets are transient; only canonical SHA-256 hashes reach RPCs."""
import hashlib
import secrets

# 31 unambiguous symbols; 16 draws provide approximately 79.3 bits.
CONTACT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_contact_code() -> str:
    code = "".join(secrets.choice(CONTACT_ALPHABET) for _ in range(16))
    return "APT-" + "-".join(code[i:i + 4] for i in range(0, 16, 4))


def normalize_contact_code(code: str) -> str:
    if not code.isascii():
        raise ValueError("Invalid contact code")
    canonical = "".join(code.upper().split()).replace("-", "")
    if len(canonical) == 19 and canonical.startswith("APT"):
        canonical = canonical[3:]
    if len(canonical) != 16 or any(c not in CONTACT_ALPHABET for c in canonical):
        raise ValueError("Invalid contact code")
    return canonical


def sha256_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(32)
