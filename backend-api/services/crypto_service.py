"""
Cryptografische hulpfuncties voor gevoelige velden.

Gebruikt Fernet (symmetric authenticated encryption, AES-128-CBC + HMAC-SHA256)
voor het versleutelen van secrets die op-rest worden opgeslagen (KB wachtwoorden etc.).

Configuratie:
  De Fernet-sleutel wordt gelezen uit de omgevingsvariabele DENJOY_FERNET_KEY,
  of — als fallback — gegenereerd en opgeslagen in config.json (sleutel: fernet_key).

Gebruik:
  from services.crypto_service import encrypt_secret, decrypt_secret

  opaque = encrypt_secret("Mijn_Wachtwoord123")
  plaintext = decrypt_secret(opaque)  # => "Mijn_Wachtwoord123"
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ─── cryptography is een hard requirement ────────────────────────
try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError as _crypto_import_error:
    raise ImportError(
        "[crypto] Het pakket 'cryptography' is niet geïnstalleerd maar is VEREIST. "
        "Installeer het met: pip install cryptography\n"
        "Of installeer alle dependencies met: pip install -r requirements.txt"
    ) from _crypto_import_error

_fernet_instance = None


# ─── sleutelresolutie ────────────────────────────────────────────

def _load_or_create_key() -> bytes:
    """
    Laad de Fernet-sleutel uit (in volgorde van prioriteit):
    1. Omgevingsvariabele DENJOY_FERNET_KEY
    2. config.json naast de project-root (sleutel: fernet_key)
    3. Genereer een nieuwe sleutel en sla op in config.json
    """
    # 1. Omgevingsvariabele
    env_key = os.environ.get("DENJOY_FERNET_KEY", "").strip()
    if env_key:
        try:
            return base64.urlsafe_b64decode(env_key)
        except Exception:
            pass

    # 2. config.json
    config_paths = [
        Path(__file__).parent.parent / "storage" / "config.json",
        Path(__file__).parent.parent / "config.json",
    ]
    for cfg_path in config_paths:
        if cfg_path.exists():
            try:
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                stored = cfg.get("fernet_key", "")
                if stored:
                    return base64.urlsafe_b64decode(stored)
            except Exception:
                pass

    # 3. Genereer nieuwe sleutel en sla op
    new_key = Fernet.generate_key()

    for cfg_path in config_paths:
        if cfg_path.exists():
            try:
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
                cfg["fernet_key"] = new_key.decode()
                cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
                logger.info("[crypto] Nieuwe Fernet-sleutel gegenereerd en opgeslagen in %s", cfg_path)
                break
            except Exception as exc:
                logger.warning("[crypto] Kon sleutel niet opslaan in %s: %s", cfg_path, exc)

    return new_key


def _get_fernet():
    """Singleton: initialiseer Fernet éénmalig."""
    global _fernet_instance
    if _fernet_instance is None:
        key = _load_or_create_key()
        _fernet_instance = Fernet(base64.urlsafe_b64encode(key[:32]))
    return _fernet_instance


# ─── fallback obfuscatie (geen echte beveiliging — alleen als cryptography ontbreekt) ──

def _xor_obfuscate(text: str) -> str:
    """XOR-obfuscatie met een vaste seed. Niet cryptografisch veilig — alleen noodfallback."""
    key = b"DenjoyObfuscKey2026"
    data = text.encode("utf-8")
    result = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return "xor:" + base64.b64encode(result).decode()


def _xor_deobfuscate(token: str) -> str:
    key = b"DenjoyObfuscKey2026"
    data = base64.b64decode(token[4:])
    result = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return result.decode("utf-8")


# ─── publieke interface ───────────────────────────────────────────

def encrypt_secret(plaintext: str) -> str:
    """
    Versleutel een geheim (wachtwoord, token, etc.) voor opslag.
    Retourneert een undoorzichtige string die kan worden opgeslagen in de database.
    Lege string retourneert lege string (geen versleuteling nodig).
    """
    if not plaintext:
        return plaintext
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode()


def decrypt_secret(token: str) -> str:
    """
    Ontsleutel een eerder versleuteld geheim.
    Geeft leeg string terug bij fout (bijv. ongeldig token).
    Onversleutelde waarden (migratie) worden direct teruggegeven.
    """
    if not token:
        return token

    # Detecteer XOR-fallback
    if token.startswith("xor:"):
        try:
            return _xor_deobfuscate(token)
        except Exception:
            return ""

    try:
        return _get_fernet().decrypt(token.encode()).decode("utf-8")
    except InvalidToken:
        logger.warning("[crypto] Ontsleuteling mislukt: ongeldig token.")
        return ""
    except Exception as exc:
        logger.error("[crypto] Ontsleuteling fout: %s", exc)
        return ""


def is_encrypted(value: str) -> bool:
    """Detecteer of een waarde al versleuteld is (Fernet of XOR)."""
    if not value:
        return False
    if value.startswith("xor:"):
        return True
    # Fernet-tokens beginnen met 'gAA' (base64 van versie-byte 0x80)
    return value.startswith("gAA")


def migrate_plaintext_secret(value: str) -> str:
    """
    Versleutel een plaintext-waarde als die nog niet versleuteld is.
    Handig voor éénmalige migratie van bestaande DB-records.
    """
    if not value or is_encrypted(value):
        return value
    return encrypt_secret(value)
