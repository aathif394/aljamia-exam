#!/usr/bin/env python3
"""
One-time setup: create exam centres and admin/invigilator accounts.

Usage:
    cd api
    source .venv/bin/activate
    python setup_admin.py
"""

import asyncio, os, sys, getpass
import asyncpg
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv()  # picks up .env in the current directory

DB_DSN = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/examdb")

pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")


async def main():
    print("\n=== Exam System Setup ===\n")

    try:
        conn = await asyncpg.connect(dsn=DB_DSN)
    except Exception as e:
        sys.exit(f"Cannot connect to database ({DB_DSN}):\n  {e}\n\nSet DATABASE_URL env var and retry.")

    # Apply schema if tables don't exist yet
    schema_exists = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='admins')"
    )
    if not schema_exists:
        print("Applying schema.sql…")
        schema = open(os.path.join(os.path.dirname(__file__), "schema.sql")).read()
        await conn.execute(schema)
        print("Schema applied.\n")

    # ── Centres ───────────────────────────────────────────────────────────
    centres = await conn.fetch("SELECT id, name_en FROM centres ORDER BY id")
    if centres:
        print("Existing centres:")
        for c in centres:
            print(f"  [{c['id']}] {c['name_en']}")
    else:
        print("No centres yet.")

    if input("\nAdd a centre? (y/N): ").strip().lower() == "y":
        name_en = input("  Name (English): ").strip()
        name_ar = input("  Name (Arabic, optional): ").strip()
        if name_en:
            cid = await conn.fetchval(
                "INSERT INTO centres (name_en, name_ar) VALUES ($1, $2) RETURNING id",
                name_en, name_ar or ""
            )
            print(f"  Created centre id={cid}")
        centres = await conn.fetch("SELECT id, name_en FROM centres ORDER BY id")

    # ── Create admin / invigilator ─────────────────────────────────────────
    print("\n--- Create Account ---")
    username = input("Username: ").strip()
    if not username:
        print("Skipped."); await conn.close(); return

    if await conn.fetchval("SELECT id FROM admins WHERE username=$1", username):
        print(f"'{username}' already exists.")
    else:
        password  = getpass.getpass("Password: ")
        password2 = getpass.getpass("Confirm:  ")
        if password != password2:
            sys.exit("Passwords do not match.")

        role = input("Role [admin/invigilator] (default: admin): ").strip().lower() or "admin"
        if role not in ("admin", "invigilator"):
            sys.exit("Invalid role.")

        centre_id = None
        if centres:
            ids = [str(c["id"]) for c in centres]
            cid_in = input(f"Centre id [{'/'.join(ids)}, blank=none]: ").strip()
            if cid_in in ids:
                centre_id = int(cid_in)

        await conn.execute(
            "INSERT INTO admins (username, password_hash, role, centre_id) VALUES ($1,$2,$3,$4)",
            username, pwd_ctx.hash(password), role, centre_id
        )
        print(f"\n✓ Account '{username}' ({role}) created.")

    # ── Summary ───────────────────────────────────────────────────────────
    admins = await conn.fetch("SELECT username, role, centre_id FROM admins ORDER BY id")
    print("\nAll accounts:")
    for a in admins:
        print(f"  {a['username']}  ({a['role']})  centre={a['centre_id']}")

    await conn.close()
    print("\nStart server:  uvicorn main:app --host 0.0.0.0 --port 8000\n")
    print("Admin login:   /admin  (username + password above)")
    print("Student login: /       (roll = their phone number, password announced by invigilator)\n")


asyncio.run(main())
