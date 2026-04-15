"""
Knowledge Base Service

Alle KB-functies per tenant: assets, vlans, pages, contacts, passwords,
software, domeinen, M365-profiel en changelog.

Elke tenant krijgt een eigen SQLite-database onder storage/kb/{tenant_id}/kb.sqlite.

Functies die assessment-snapshot data nodig hebben (kb_list_domains,
kb_get_m365_profile) ontvangen een optionele `get_snapshot` callable zodat er
geen circulaire import naar app.py nodig is.
"""

import os
import json
import sqlite3
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable

from db_layer import STORAGE_DIR

KB_DIR: Path = STORAGE_DIR / "kb"


# ─────────────────────────────────────────────────────────────
# Interne helpers: verbinding, schema-init, query wrappers
# ─────────────────────────────────────────────────────────────

def _kb_db_path(tenant_id: str) -> Path:
    safe = os.path.basename(tenant_id.replace("..", ""))
    d = KB_DIR / safe
    d.mkdir(parents=True, exist_ok=True)
    return d / "kb.sqlite"


def _kb_conn(tenant_id: str) -> sqlite3.Connection:
    conn = sqlite3.connect(str(_kb_db_path(tenant_id)), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _kb_init(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS asset_types (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT DEFAULT '🖥️'
    );
    INSERT OR IGNORE INTO asset_types (name, icon) VALUES
        ('switch','🔀'),('router','🌐'),('firewall','🛡️'),
        ('ap','📡'),('server','🖥️'),('vlan','🏷️'),
        ('subnet','🕸️'),('circuit','🔌');
    CREATE TABLE IF NOT EXISTS kb_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO kb_meta (key, value) VALUES
        ('categories', '["network","security","general","procedures","hardware"]'),
        ('vlan_purposes', '[{"key":"user","label":"Gebruikers"},{"key":"server","label":"Servers"},{"key":"mgmt","label":"Management"},{"key":"guest","label":"Gasten"},{"key":"iot","label":"IoT"},{"key":"dmz","label":"DMZ"}]');
    CREATE TABLE IF NOT EXISTS assets (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_type_id INTEGER REFERENCES asset_types(id),
        name          TEXT NOT NULL,
        hostname      TEXT, ip_address TEXT, location TEXT,
        vendor TEXT, model TEXT, firmware TEXT, serial TEXT,
        notes TEXT, is_active INTEGER DEFAULT 1,
        switch_config TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vlans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vlan_id INTEGER NOT NULL, name TEXT NOT NULL,
        subnet TEXT, gateway TEXT, description TEXT,
        purpose TEXT DEFAULT 'user', notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kb_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, content TEXT DEFAULT '',
        category TEXT DEFAULT 'network', order_index INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, role TEXT, phone TEXT, email TEXT,
        is_primary_contact INTEGER DEFAULT 0, notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kb_passwords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, category TEXT, username TEXT,
        secret_ref TEXT, strength INTEGER DEFAULT 0,
        last_updated TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_software (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, vendor TEXT, software_type TEXT,
        licenses INTEGER, cost TEXT, expiry TEXT,
        status TEXT DEFAULT 'active', ref TEXT, notes TEXT,
        unit_price REAL, total_price REAL
    );
    CREATE TABLE IF NOT EXISTS kb_domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL, domain_type TEXT, registrar TEXT,
        expiry TEXT, ssl_expiry TEXT, ssl_issuer TEXT,
        status TEXT DEFAULT 'active', auto_renew INTEGER DEFAULT 0,
        nameservers TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        change_date TEXT NOT NULL, user_name TEXT, action TEXT NOT NULL,
        category TEXT, ref TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_m365_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tenant_name TEXT, tenant_id TEXT, global_admin TEXT,
        license_type TEXT, licenses_total INTEGER, licenses_used INTEGER,
        mfa TEXT, conditional_access INTEGER DEFAULT 0, mdm TEXT,
        defender INTEGER DEFAULT 0, purview INTEGER DEFAULT 0,
        hybrid INTEGER DEFAULT 0, ad_connect TEXT,
        exchange_hybrid INTEGER DEFAULT 0, shared_mailboxes INTEGER DEFAULT 0,
        guest_users INTEGER DEFAULT 0, notes TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    );
    """)
    # Schema migrations — blijft backward-compatible
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(assets)").fetchall()}
    if "switch_config" not in cols:
        conn.execute("ALTER TABLE assets ADD COLUMN switch_config TEXT")
    software_cols = {r["name"] for r in conn.execute("PRAGMA table_info(kb_software)").fetchall()}
    if "unit_price" not in software_cols:
        conn.execute("ALTER TABLE kb_software ADD COLUMN unit_price REAL")
    if "total_price" not in software_cols:
        conn.execute("ALTER TABLE kb_software ADD COLUMN total_price REAL")
    domain_cols = {r["name"] for r in conn.execute("PRAGMA table_info(kb_domains)").fetchall()}
    for _col, _def in [("source", "TEXT DEFAULT 'manual'"), ("spf", "TEXT"), ("dmarc", "TEXT"), ("dkim", "TEXT")]:
        if _col not in domain_cols:
            conn.execute(f"ALTER TABLE kb_domains ADD COLUMN {_col} {_def}")
    conn.commit()


def _kb_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def _kb_row(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    r = conn.execute(sql, params).fetchone()
    return dict(r) if r else None


# Path helpers (herbruikbaar vanuit route-dispatchers)
def kb_tid(path: str) -> str:
    """Extract tenant_id from /api/kb/{tenant_id}/... paths."""
    return path.split("/")[3]


def kb_iid(path: str) -> int:
    """Extract integer item id from last path segment."""
    return int(path.split("/")[-1])


# ─────────────────────────────────────────────────────────────
# Asset-types
# ─────────────────────────────────────────────────────────────

def kb_list_asset_types(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT * FROM asset_types ORDER BY name")


def kb_create_asset_type(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")
    icon = (data.get("icon") or "🖥️").strip()
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute("INSERT INTO asset_types (name, icon) VALUES (?, ?)", (name, icon))
        c.commit()
        row = _kb_row(c, "SELECT * FROM asset_types WHERE id=?", (cur.lastrowid,))
    if not row:
        raise ValueError("Insert failed")
    return row


def kb_delete_asset_type(tid: str, type_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM asset_types WHERE id=?", (type_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# Meta (categories & vlan_purposes)
# ─────────────────────────────────────────────────────────────

def kb_get_meta(tid: str) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        rows = _kb_rows(c, "SELECT key, value FROM kb_meta")
    result: Dict[str, Any] = {}
    for r in rows:
        try:
            result[r["key"]] = json.loads(r["value"])
        except Exception:
            result[r["key"]] = r["value"]
    return result


def kb_put_meta(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"categories", "vlan_purposes"}
    with _kb_conn(tid) as c:
        _kb_init(c)
        for key in allowed:
            if key in data:
                c.execute(
                    "INSERT OR REPLACE INTO kb_meta (key, value) VALUES (?, ?)",
                    (key, json.dumps(data[key], ensure_ascii=False)),
                )
        c.commit()
    return kb_get_meta(tid)


# ─────────────────────────────────────────────────────────────
# Assets
# ─────────────────────────────────────────────────────────────

def kb_list_assets(tid: str, asset_type: Optional[str] = None) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        sql = ("SELECT a.*, t.name as type_name, t.icon as type_icon "
               "FROM assets a LEFT JOIN asset_types t ON a.asset_type_id=t.id")
        params: list = []
        if asset_type:
            sql += " WHERE t.name=?"
            params.append(asset_type)
        sql += " ORDER BY a.name"
        rows = _kb_rows(c, sql, tuple(params))
    for row in rows:
        try:
            row["switch_config"] = json.loads(row.get("switch_config") or "null")
        except Exception:
            row["switch_config"] = None
    return rows


def kb_create_asset(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("name"):
        raise ValueError("name is required")
    switch_config = data.get("switch_config")
    switch_config_json = json.dumps(switch_config, ensure_ascii=False) if switch_config is not None else None
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO assets (asset_type_id,name,hostname,ip_address,location,vendor,model,"
            "firmware,serial,notes,is_active,switch_config) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (data.get("asset_type_id"), data["name"], data.get("hostname"), data.get("ip_address"),
             data.get("location"), data.get("vendor"), data.get("model"), data.get("firmware"),
             data.get("serial"), data.get("notes"), int(data.get("is_active", 1)), switch_config_json),
        )
        c.commit()
        row = _kb_row(
            c,
            "SELECT a.*, t.name as type_name, t.icon as type_icon "
            "FROM assets a LEFT JOIN asset_types t ON a.asset_type_id=t.id WHERE a.id=?",
            (cur.lastrowid,),
        )
    if not row:
        raise ValueError("Insert failed")
    try:
        row["switch_config"] = json.loads(row.get("switch_config") or "null")
    except Exception:
        row["switch_config"] = None
    return row


def kb_update_asset(tid: str, asset_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    switch_config = data.get("switch_config")
    switch_config_json = json.dumps(switch_config, ensure_ascii=False) if switch_config is not None else None
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE assets SET asset_type_id=?,name=?,hostname=?,ip_address=?,location=?,vendor=?,model=?,"
            "firmware=?,serial=?,notes=?,is_active=?,switch_config=?,updated_at=datetime('now') WHERE id=?",
            (data.get("asset_type_id"), data.get("name"), data.get("hostname"), data.get("ip_address"),
             data.get("location"), data.get("vendor"), data.get("model"), data.get("firmware"),
             data.get("serial"), data.get("notes"), int(data.get("is_active", 1)), switch_config_json, asset_id),
        )
        c.commit()
        row = _kb_row(
            c,
            "SELECT a.*, t.name as type_name, t.icon as type_icon "
            "FROM assets a LEFT JOIN asset_types t ON a.asset_type_id=t.id WHERE a.id=?",
            (asset_id,),
        )
    if not row:
        raise ValueError("Not found")
    try:
        row["switch_config"] = json.loads(row.get("switch_config") or "null")
    except Exception:
        row["switch_config"] = None
    return row


def kb_delete_asset(tid: str, asset_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM assets WHERE id=?", (asset_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# VLANs
# ─────────────────────────────────────────────────────────────

def kb_list_vlans(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT * FROM vlans ORDER BY vlan_id")


def kb_create_vlan(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("vlan_id") or not data.get("name"):
        raise ValueError("vlan_id and name are required")
    try:
        vnum = int(data["vlan_id"])
        if not (1 <= vnum <= 4094):
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("vlan_id must be 1-4094")
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO vlans (vlan_id,name,subnet,gateway,description,purpose,notes) VALUES (?,?,?,?,?,?,?)",
            (vnum, data["name"], data.get("subnet"), data.get("gateway"),
             data.get("description"), data.get("purpose", "user"), data.get("notes")),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM vlans WHERE id=?", (cur.lastrowid,))
    if not row:
        raise ValueError("Insert failed")
    return row


def kb_update_vlan(tid: str, vlan_db_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE vlans SET vlan_id=?,name=?,subnet=?,gateway=?,description=?,purpose=?,notes=?,"
            "updated_at=datetime('now') WHERE id=?",
            (data.get("vlan_id"), data.get("name"), data.get("subnet"), data.get("gateway"),
             data.get("description"), data.get("purpose", "user"), data.get("notes"), vlan_db_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM vlans WHERE id=?", (vlan_db_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_vlan(tid: str, vlan_db_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM vlans WHERE id=?", (vlan_db_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# Pagina's (kennisbank-artikelen)
# ─────────────────────────────────────────────────────────────

def kb_list_pages(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT id,title,category,order_index,updated_at FROM kb_pages ORDER BY order_index,title")


def kb_get_page(tid: str, page_id: int) -> Optional[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_row(c, "SELECT * FROM kb_pages WHERE id=?", (page_id,))


def kb_create_page(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("title"):
        raise ValueError("title is required")
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO kb_pages (title,content,category,order_index) VALUES (?,?,?,?)",
            (data["title"], data.get("content", ""), data.get("category", "network"), data.get("order_index", 0)),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM kb_pages WHERE id=?", (cur.lastrowid,))
    if not row:
        raise ValueError("Insert failed")
    return row


def kb_update_page(tid: str, page_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE kb_pages SET title=?,content=?,category=?,order_index=?,updated_at=datetime('now') WHERE id=?",
            (data.get("title"), data.get("content", ""), data.get("category", "network"),
             data.get("order_index", 0), page_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM kb_pages WHERE id=?", (page_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_page(tid: str, page_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM kb_pages WHERE id=?", (page_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# Contacten
# ─────────────────────────────────────────────────────────────

def kb_list_contacts(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT * FROM contacts ORDER BY is_primary_contact DESC, name")


def kb_create_contact(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("name"):
        raise ValueError("name is required")
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO contacts (name,role,phone,email,is_primary_contact,notes) VALUES (?,?,?,?,?,?)",
            (data["name"], data.get("role"), data.get("phone"), data.get("email"),
             int(data.get("is_primary_contact", 0)), data.get("notes")),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM contacts WHERE id=?", (cur.lastrowid,))
    if not row:
        raise ValueError("Insert failed")
    return row


def kb_update_contact(tid: str, contact_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE contacts SET name=?,role=?,phone=?,email=?,is_primary_contact=?,notes=? WHERE id=?",
            (data.get("name"), data.get("role"), data.get("phone"), data.get("email"),
             int(data.get("is_primary_contact", 0)), data.get("notes"), contact_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM contacts WHERE id=?", (contact_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_contact(tid: str, contact_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM contacts WHERE id=?", (contact_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# Wachtwoorden (versleuteld via secret_ref)
# ─────────────────────────────────────────────────────────────

def kb_list_passwords(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT * FROM kb_passwords ORDER BY category, name")


def kb_create_password(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("name"):
        raise ValueError("name is required")
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO kb_passwords (name,category,username,secret_ref,strength,last_updated,notes) "
            "VALUES (?,?,?,?,?,?,?)",
            (data["name"], data.get("category"), data.get("username"), data.get("secret_ref"),
             int(data.get("strength") or 0), data.get("last_updated"), data.get("notes")),
        )
        c.commit()
        return _kb_row(c, "SELECT * FROM kb_passwords WHERE id=?", (cur.lastrowid,))


def kb_update_password(tid: str, item_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE kb_passwords SET name=?,category=?,username=?,secret_ref=?,strength=?,"
            "last_updated=?,notes=? WHERE id=?",
            (data.get("name"), data.get("category"), data.get("username"), data.get("secret_ref"),
             int(data.get("strength") or 0), data.get("last_updated"), data.get("notes"), item_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM kb_passwords WHERE id=?", (item_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_password(tid: str, item_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM kb_passwords WHERE id=?", (item_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# Software / licenties
# ─────────────────────────────────────────────────────────────

def _parse_licenses_price(data: Dict[str, Any]):
    """Valideer en normaliseer licenses, unit_price en total_price."""
    licenses = data.get("licenses")
    unit_price = data.get("unit_price")
    total_price = data.get("total_price")

    licenses = int(licenses) if licenses not in (None, "") else None
    unit_price = float(unit_price) if unit_price not in (None, "") else None

    if total_price in (None, "") and licenses is not None and unit_price is not None:
        total_price = round(licenses * unit_price, 2)
    elif total_price not in (None, ""):
        try:
            total_price = float(total_price)
        except (TypeError, ValueError):
            total_price = None
    else:
        total_price = None

    return licenses, unit_price, total_price


def kb_list_software(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT * FROM kb_software ORDER BY vendor, name")


def kb_create_software(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("name"):
        raise ValueError("name is required")
    licenses, unit_price, total_price = _parse_licenses_price(data)
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO kb_software (name,vendor,software_type,licenses,cost,expiry,status,ref,notes,"
            "unit_price,total_price) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (data["name"], data.get("vendor"), data.get("software_type"), licenses,
             data.get("cost"), data.get("expiry"), data.get("status", "active"), data.get("ref"),
             data.get("notes"), unit_price, total_price),
        )
        c.commit()
        return _kb_row(c, "SELECT * FROM kb_software WHERE id=?", (cur.lastrowid,))


def kb_update_software(tid: str, item_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    licenses, unit_price, total_price = _parse_licenses_price(data)
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE kb_software SET name=?,vendor=?,software_type=?,licenses=?,cost=?,expiry=?,status=?,"
            "ref=?,notes=?,unit_price=?,total_price=? WHERE id=?",
            (data.get("name"), data.get("vendor"), data.get("software_type"), licenses,
             data.get("cost"), data.get("expiry"), data.get("status", "active"), data.get("ref"),
             data.get("notes"), unit_price, total_price, item_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM kb_software WHERE id=?", (item_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_software(tid: str, item_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM kb_software WHERE id=?", (item_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# Domeinen — verrijkt met assessment DNS-checks
# ─────────────────────────────────────────────────────────────

def kb_list_domains(
    tid: str,
    get_snapshot: Optional[Callable] = None,
) -> List[Dict[str, Any]]:
    """
    Haal KB-domeinen op, optioneel verrijkt met assessment DNS-checks.

    Args:
        tid: Tenant ID
        get_snapshot: Optionele callable(tenant_id) → snapshot dict.
                      Geef `_latest_assessment_snapshot_for_tenant` mee vanuit app.py.
    """
    with _kb_conn(tid) as c:
        _kb_init(c)
        manual = _kb_rows(c, "SELECT * FROM kb_domains ORDER BY domain")

    snap = (get_snapshot(tid) if get_snapshot else None) or {}
    assessment_checks = [
        ch for ch in (snap.get("assessment_domain_dns_checks") or [])
        if isinstance(ch, dict) and (ch.get("Domain") or ch.get("domain"))
    ]
    if not assessment_checks:
        return [dict(r, source=r.get("source") or "manual") for r in manual]

    manual_domains = {(r.get("domain") or "").strip().lower() for r in manual}
    result: List[Dict[str, Any]] = []

    for row in manual:
        row = dict(row)
        row.setdefault("source", "manual")
        row_domain = (row.get("domain") or "").strip().lower()
        for ch in assessment_checks:
            if (ch.get("Domain") or ch.get("domain") or "").strip().lower() == row_domain:
                row["spf"] = str(ch.get("SPF") or ch.get("spf") or row.get("spf") or "")
                row["dmarc"] = str(ch.get("DMARC") or ch.get("dmarc") or row.get("dmarc") or "")
                row["dkim"] = str(ch.get("DKIM") or ch.get("dkim") or row.get("dkim") or "")
                break
        result.append(row)

    # Voeg assessment-only domeinen toe als read-only rijen
    pseudo_id = -1
    for ch in assessment_checks:
        ch_domain = (ch.get("Domain") or ch.get("domain") or "").strip().lower()
        if not ch_domain or ch_domain in manual_domains:
            continue
        result.append({
            "id": pseudo_id,
            "domain": ch.get("Domain") or ch.get("domain"),
            "domain_type": "M365",
            "registrar": None, "expiry": None, "ssl_expiry": None,
            "ssl_issuer": None, "status": "active", "auto_renew": 0,
            "nameservers": None, "notes": None,
            "source": "assessment",
            "spf": str(ch.get("SPF") or ch.get("spf") or ""),
            "dmarc": str(ch.get("DMARC") or ch.get("dmarc") or ""),
            "dkim": str(ch.get("DKIM") or ch.get("dkim") or ""),
        })
        pseudo_id -= 1
    return result


def kb_create_domain(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("domain"):
        raise ValueError("domain is required")
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO kb_domains (domain,domain_type,registrar,expiry,ssl_expiry,ssl_issuer,"
            "status,auto_renew,nameservers,notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (data["domain"], data.get("domain_type"), data.get("registrar"), data.get("expiry"),
             data.get("ssl_expiry"), data.get("ssl_issuer"), data.get("status", "active"),
             int(data.get("auto_renew", 0)), data.get("nameservers"), data.get("notes")),
        )
        c.commit()
        return _kb_row(c, "SELECT * FROM kb_domains WHERE id=?", (cur.lastrowid,))


def kb_update_domain(tid: str, item_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE kb_domains SET domain=?,domain_type=?,registrar=?,expiry=?,ssl_expiry=?,"
            "ssl_issuer=?,status=?,auto_renew=?,nameservers=?,notes=? WHERE id=?",
            (data.get("domain"), data.get("domain_type"), data.get("registrar"), data.get("expiry"),
             data.get("ssl_expiry"), data.get("ssl_issuer"), data.get("status", "active"),
             int(data.get("auto_renew", 0)), data.get("nameservers"), data.get("notes"), item_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM kb_domains WHERE id=?", (item_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_domain(tid: str, item_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM kb_domains WHERE id=?", (item_id,))
        c.commit()


# ─────────────────────────────────────────────────────────────
# M365-profiel — verrijkt met assessment-snapshot
# ─────────────────────────────────────────────────────────────

def kb_get_m365_profile(
    tid: str,
    get_snapshot: Optional[Callable] = None,
    get_sku_friendly_name: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Haal M365-profiel op, optioneel verrijkt met assessment-snapshot.

    Args:
        tid: Tenant ID
        get_snapshot: Optionele callable(tenant_id) → snapshot dict.
        get_sku_friendly_name: Optionele callable(sku_str) → vriendelijke naam.
    """
    with _kb_conn(tid) as c:
        _kb_init(c)
        row = _kb_row(c, "SELECT * FROM kb_m365_profile WHERE id=1")

    base = row or {
        "id": 1, "tenant_name": None, "tenant_id": None, "global_admin": None,
        "license_type": None, "licenses_total": None, "licenses_used": None,
        "mfa": None, "conditional_access": 0, "mdm": None, "defender": 0,
        "purview": 0, "hybrid": 0, "ad_connect": None, "exchange_hybrid": 0,
        "shared_mailboxes": 0, "guest_users": 0, "notes": None,
    }

    assessment = (get_snapshot(tid) if get_snapshot else None)
    if assessment:
        for key in ("tenant_name", "tenant_id", "license_type", "licenses_total", "licenses_used", "mfa"):
            if assessment.get(key) not in (None, ""):
                base[key] = assessment[key]
        if base.get("license_type") and get_sku_friendly_name:
            base["license_type"] = get_sku_friendly_name(str(base["license_type"]))
        if assessment.get("conditional_access") is not None:
            base["conditional_access"] = 1 if assessment["conditional_access"] else 0
        base["assessment_generated_at"] = assessment.get("assessment_generated_at")
        base["assessment_report_id"] = assessment.get("assessment_report_id")
        raw_licenses = assessment.get("assessment_licenses") or []
        normalized_licenses = []
        for item in raw_licenses:
            if not isinstance(item, dict):
                continue
            license_item = dict(item)
            sku = str(license_item.get("SkuPartNumber") or license_item.get("sku_part_number") or "").strip()
            if sku and get_sku_friendly_name:
                license_item["displayName"] = get_sku_friendly_name(sku)
            normalized_licenses.append(license_item)
        base["assessment_licenses"] = normalized_licenses
        base["assessment_app_registrations"] = assessment.get("assessment_app_registrations") or []
        base["assessment_domain_dns_checks"] = assessment.get("assessment_domain_dns_checks") or []
        base["assessment_user_mailboxes"] = assessment.get("assessment_user_mailboxes") or []
    else:
        base["assessment_generated_at"] = None
        base["assessment_report_id"] = None
        base["assessment_licenses"] = []
        base["assessment_app_registrations"] = []
        base["assessment_domain_dns_checks"] = []
        base["assessment_user_mailboxes"] = []
    return base


def kb_put_m365_profile(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "INSERT OR REPLACE INTO kb_m365_profile ("
            "id,tenant_name,tenant_id,global_admin,license_type,licenses_total,licenses_used,"
            "mfa,conditional_access,mdm,defender,purview,hybrid,ad_connect,exchange_hybrid,"
            "shared_mailboxes,guest_users,notes,updated_at"
            ") VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
            (data.get("tenant_name"), data.get("tenant_id"), data.get("global_admin"),
             data.get("license_type"), data.get("licenses_total"), data.get("licenses_used"),
             data.get("mfa"), int(data.get("conditional_access", 0)), data.get("mdm"),
             int(data.get("defender", 0)), int(data.get("purview", 0)), int(data.get("hybrid", 0)),
             data.get("ad_connect"), int(data.get("exchange_hybrid", 0)),
             data.get("shared_mailboxes"), data.get("guest_users"), data.get("notes")),
        )
        c.commit()
    return kb_get_m365_profile(tid)


def kb_sync_from_assessment(
    tid: str,
    force: bool = False,
    get_snapshot: Optional[Callable] = None,
    get_sku_friendly_name: Optional[Callable] = None,
) -> Dict[str, Any]:
    """Synchroniseer assessment-snapshot data naar persistente KB-tabellen."""
    _ = force  # gereserveerd voor toekomstige volledige resync-logica
    snapshot = (get_snapshot(tid) if get_snapshot else None) or {}
    if not snapshot:
        return {
            "ok": False,
            "message": "Geen assessment-snapshot beschikbaar voor synchronisatie.",
            "counts": {},
        }

    counts = {
        "assets_created": 0,
        "domains_created": 0,
        "software_created": 0,
        "software_updated": 0,
        "contacts_created": 0,
        "m365_profile_synced": 0,
        "changelog_created": 0,
    }

    with _kb_conn(tid) as c:
        _kb_init(c)

        # 1) Assessment mailboxes -> KB contacts (niet assets!)
        for key in ("assessment_user_mailboxes", "assessment_shared_mailboxes"):
            for item in (snapshot.get(key) or []):
                if not isinstance(item, dict):
                    continue
                display_name = (
                    item.get("DisplayName")
                    or item.get("displayName")
                    or item.get("PrimarySmtpAddress")
                    or item.get("primarySmtpAddress")
                    or item.get("mail")
                    or "Mailbox"
                )
                mail = (
                    item.get("PrimarySmtpAddress")
                    or item.get("primarySmtpAddress")
                    or item.get("mail")
                    or item.get("UserPrincipalName")
                    or item.get("userPrincipalName")
                )

                existing_contact = _kb_row(
                    c,
                    "SELECT id FROM contacts WHERE lower(email)=lower(?) OR lower(name)=lower(?)",
                    (mail or "", display_name),
                )
                if existing_contact:
                    continue

                role = "Gedeeld postvak" if key == "assessment_shared_mailboxes" else "E-mail"
                c.execute(
                    "INSERT INTO contacts (name,role,email,notes) VALUES (?,?,?,?)",
                    (
                        display_name,
                        role,
                        mail,
                        f"Auto-geimporteerd vanuit assessment ({key}).",
                    ),
                )
                counts["contacts_created"] += 1

        # 2) Assessment DNS checks -> KB domains
        for ch in (snapshot.get("assessment_domain_dns_checks") or []):
            if not isinstance(ch, dict):
                continue
            domain = (ch.get("Domain") or ch.get("domain") or "").strip()
            if not domain:
                continue
            exists = _kb_row(c, "SELECT id FROM kb_domains WHERE lower(domain)=lower(?)", (domain,))
            if exists:
                continue
            spf = str(ch.get("SPF") or ch.get("spf") or "")
            dkim = str(ch.get("DKIM") or ch.get("dkim") or "")
            dmarc = str(ch.get("DMARC") or ch.get("dmarc") or "")
            notes = f"Assessment DNS-checks: SPF={spf or '-'}, DKIM={dkim or '-'}, DMARC={dmarc or '-'}"
            c.execute(
                "INSERT INTO kb_domains (domain,domain_type,status,auto_renew,notes) VALUES (?,?,?,?,?)",
                (domain, "M365", "active", 0, notes),
            )
            counts["domains_created"] += 1

        # 3) Assessment licenses -> KB software
        for lic in (snapshot.get("assessment_licenses") or []):
            if not isinstance(lic, dict):
                continue
            sku = str(lic.get("SkuPartNumber") or lic.get("sku_part_number") or "").strip()
            if not sku:
                continue
            name = get_sku_friendly_name(sku) if get_sku_friendly_name else sku
            consumed = lic.get("ConsumedUnits") or lic.get("consumed_units") or lic.get("consumedUnits")
            enabled = lic.get("EnabledUnits") or lic.get("enabled_units") or lic.get("enabledUnits")
            notes = f"Assessment license sync. SKU={sku}. Enabled={enabled if enabled is not None else '-'}"
            existing = _kb_row(c, "SELECT id FROM kb_software WHERE lower(name)=lower(?) AND software_type='m365-license'", (name,))
            if existing:
                c.execute(
                    "UPDATE kb_software SET licenses=?,notes=? WHERE id=?",
                    (consumed if consumed is not None else None, notes, existing["id"]),
                )
                counts["software_updated"] += 1
            else:
                c.execute(
                    "INSERT INTO kb_software (name,software_type,licenses,status,ref,notes) VALUES (?,?,?,?,?,?)",
                    (name, "m365-license", consumed if consumed is not None else None, "active", sku, notes),
                )
                counts["software_created"] += 1

        # 4) Global admin contact from assessment
        global_admin = snapshot.get("global_admin")
        if isinstance(global_admin, str) and global_admin.strip():
            admin_mail = global_admin.strip()
            existing_contact = _kb_row(c, "SELECT id FROM contacts WHERE lower(email)=lower(?)", (admin_mail,))
            if not existing_contact:
                c.execute(
                    "INSERT INTO contacts (name,role,email,is_primary_contact,notes) VALUES (?,?,?,?,?)",
                    (admin_mail.split("@")[0], "Global admin", admin_mail, 1, "Auto-geimporteerd vanuit assessment."),
                )
                counts["contacts_created"] += 1

        c.commit()

    # 5) Sync M365 profile via bestaande writer
    kb_put_m365_profile(
        tid,
        {
            "tenant_name": snapshot.get("tenant_name"),
            "tenant_id": snapshot.get("tenant_id"),
            "global_admin": snapshot.get("global_admin"),
            "license_type": snapshot.get("license_type"),
            "licenses_total": snapshot.get("licenses_total"),
            "licenses_used": snapshot.get("licenses_used"),
            "mfa": snapshot.get("mfa"),
            "conditional_access": 1 if snapshot.get("conditional_access") else 0,
            "shared_mailboxes": snapshot.get("shared_mailboxes") or 0,
            "guest_users": snapshot.get("guest_users") or 0,
            "notes": "Bijgewerkt vanuit assessment-snapshot.",
        },
    )
    counts["m365_profile_synced"] = 1

    # 6) Changelog entry
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "INSERT INTO kb_changelog (change_date,user_name,action,category,ref,notes) VALUES (?,?,?,?,?,?)",
            (
                date.today().isoformat(),
                "system",
                "Assessment synchronisatie",
                "assessment-sync",
                snapshot.get("assessment_report_id"),
                json.dumps(counts, ensure_ascii=False),
            ),
        )
        c.commit()
    counts["changelog_created"] = 1

    return {
        "ok": True,
        "message": "Assessment data gesynchroniseerd naar kennisbank.",
        "counts": counts,
        "assessment_generated_at": snapshot.get("assessment_generated_at"),
        "assessment_report_id": snapshot.get("assessment_report_id"),
    }


# ─────────────────────────────────────────────────────────────
# Changelog
# ─────────────────────────────────────────────────────────────

def kb_list_changelog(tid: str) -> List[Dict[str, Any]]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        return _kb_rows(c, "SELECT * FROM kb_changelog ORDER BY change_date DESC, id DESC")


def kb_create_changelog(tid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    if not data.get("change_date") or not data.get("action"):
        raise ValueError("change_date and action are required")
    with _kb_conn(tid) as c:
        _kb_init(c)
        cur = c.execute(
            "INSERT INTO kb_changelog (change_date,user_name,action,category,ref,notes) VALUES (?,?,?,?,?,?)",
            (data["change_date"], data.get("user_name"), data["action"],
             data.get("category"), data.get("ref"), data.get("notes")),
        )
        c.commit()
        return _kb_row(c, "SELECT * FROM kb_changelog WHERE id=?", (cur.lastrowid,))


def kb_update_changelog(tid: str, item_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute(
            "UPDATE kb_changelog SET change_date=?,user_name=?,action=?,category=?,ref=?,notes=? WHERE id=?",
            (data.get("change_date"), data.get("user_name"), data.get("action"),
             data.get("category"), data.get("ref"), data.get("notes"), item_id),
        )
        c.commit()
        row = _kb_row(c, "SELECT * FROM kb_changelog WHERE id=?", (item_id,))
    if not row:
        raise ValueError("Not found")
    return row


def kb_delete_changelog(tid: str, item_id: int) -> None:
    with _kb_conn(tid) as c:
        _kb_init(c)
        c.execute("DELETE FROM kb_changelog WHERE id=?", (item_id,))
        c.commit()
