#!/usr/bin/env python3
"""
Exam Preflight Diagnostic
=========================
Checks every layer that could cause problems on exam day before a single
student logs in.

Run from the api/ directory:
    uv run python preflight.py

Exit codes:
    0 — all clear (or warnings only)
    1 — one or more FAIL items found
"""

import asyncio
import csv
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv()

# ── Terminal colours ──────────────────────────────────────────────────────────
_NO_COLOUR = not sys.stdout.isatty() or os.getenv("NO_COLOR")
_G  = "" if _NO_COLOUR else "\033[92m"
_Y  = "" if _NO_COLOUR else "\033[93m"
_R  = "" if _NO_COLOUR else "\033[91m"
_B  = "" if _NO_COLOUR else "\033[94m"
_BD = "" if _NO_COLOUR else "\033[1m"
_DM = "" if _NO_COLOUR else "\033[2m"
_X  = "" if _NO_COLOUR else "\033[0m"

_results: list[tuple[str, str]] = []   # (status, label)

def _ok(label: str, detail: str = "") -> None:
    _results.append(("PASS", label))
    detail_str = f"  {_DM}{detail}{_X}" if detail else ""
    print(f"  {_G}✓ PASS{_X}  {label}{detail_str}")

def _warn(label: str, detail: str = "") -> None:
    _results.append(("WARN", label))
    detail_str = f"  {_DM}{detail}{_X}" if detail else ""
    print(f"  {_Y}⚠ WARN{_X}  {label}{detail_str}")

def _fail(label: str, detail: str = "") -> None:
    _results.append(("FAIL", label))
    detail_str = f"  {_DM}{detail}{_X}" if detail else ""
    print(f"  {_R}✗ FAIL{_X}  {label}{detail_str}")

def _section(title: str) -> None:
    print(f"\n{_BD}{_B}── {title} {_X}")


# ── Credential loader ─────────────────────────────────────────────────────────
def _load_csv() -> tuple[dict[str, str], str | None]:
    """Returns (roll->password dict, filepath used) or ({}, None)."""
    candidates = [
        "credentials_2026(1).csv",
        "../credentials_2026(1).csv",
        "credentials_2026.csv",
        "../credentials_2026.csv",
    ]
    for path in candidates:
        try:
            creds: dict[str, str] = {}
            with open(path, newline="", encoding="utf-8-sig") as f:
                for row in csv.DictReader(f):
                    roll = (
                        row.get("roll_number") or row.get("Roll Number")
                        or row.get("roll") or row.get("Roll") or ""
                    ).strip()
                    pwd = (row.get("password") or row.get("Password") or "").strip()
                    if roll and pwd:
                        creds[roll] = pwd
            if creds:
                return creds, path
        except FileNotFoundError:
            continue
    return {}, None


# ── Main diagnostic ───────────────────────────────────────────────────────────
async def run() -> None:
    print(f"\n{_BD}{'═' * 56}")
    print(f"  Exam Preflight Diagnostic  —  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'═' * 56}{_X}")

    # ── Environment ──────────────────────────────────────────────────────────
    _section("Environment")

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url or "user:pass@localhost" in db_url:
        _fail("DATABASE_URL", "not set or still default placeholder")
    else:
        masked = db_url[:db_url.index("@") + 1] + "***" if "@" in db_url else db_url[:40]
        _ok("DATABASE_URL", masked)

    secret = os.getenv("SECRET_KEY", "")
    if not secret or secret == "change-this-in-production-use-env-var":
        _warn("SECRET_KEY", "using default — change before production")
    else:
        _ok("SECRET_KEY", "set")

    origins = os.getenv("ALLOWED_ORIGINS", "")
    if not origins or origins == "*":
        _warn("ALLOWED_ORIGINS", "wildcard (*) — fine for internal networks")
    else:
        _ok("ALLOWED_ORIGINS", origins[:60])

    # ── Database connectivity ─────────────────────────────────────────────────
    _section("Database Connectivity")

    pool: asyncpg.Pool | None = None
    try:
        t0 = time.monotonic()
        pool = await asyncpg.create_pool(
            db_url, min_size=1, max_size=20, command_timeout=10
        )
        _ok("Pool created", f"{(time.monotonic() - t0) * 1000:.0f} ms")
    except Exception as exc:
        _fail("Pool creation", str(exc)[:120])
        print(f"\n{_R}Cannot reach database — skipping all remaining checks.{_X}\n")
        _print_summary()
        sys.exit(1)

    # Single-query round-trip time
    t0 = time.monotonic()
    await pool.fetchval("SELECT 1")
    rtt = (time.monotonic() - t0) * 1000
    if rtt < 50:
        _ok("Query RTT", f"{rtt:.1f} ms")
    elif rtt < 150:
        _warn("Query RTT", f"{rtt:.1f} ms — borderline; monitor under load")
    else:
        _warn("Query RTT", f"{rtt:.1f} ms — high; answer saves may approach 500 ms limit")

    # Burst: 30 concurrent queries (simulates connection-pool saturation)
    try:
        t0 = time.monotonic()
        await asyncio.gather(*[pool.fetchval("SELECT 1") for _ in range(30)])
        burst = (time.monotonic() - t0) * 1000
        if burst < 500:
            _ok("30 concurrent queries", f"{burst:.0f} ms total")
        else:
            _warn("30 concurrent queries", f"{burst:.0f} ms — pool may queue under exam load")
    except Exception as exc:
        _warn("Concurrent query burst", str(exc)[:80])

    async with pool.acquire() as db:

        # ── Schema integrity ──────────────────────────────────────────────────
        _section("Schema Integrity")

        existing_tables = {
            r["tablename"]
            for r in await db.fetch(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        }
        for tbl in ["centres", "admins", "students", "papers",
                    "questions", "student_answers", "exam_config"]:
            if tbl in existing_tables:
                _ok(f"Table: {tbl}")
            else:
                _fail(f"Table: {tbl}", "MISSING — run schema.sql")

        existing_indexes = {
            r["indexname"]
            for r in await db.fetch(
                "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
            )
        }
        for idx in ["idx_students_roll", "idx_students_status",
                    "idx_q_paper_section", "idx_sa_student"]:
            if idx in existing_indexes:
                _ok(f"Index: {idx}")
            else:
                _warn(f"Index: {idx}", "missing — queries will be slower under load")

        existing_funcs = {
            r["proname"]
            for r in await db.fetch(
                "SELECT proname FROM pg_proc "
                "WHERE proname IN ('start_student_exam', 'bulk_reset_exams')"
            )
        }
        for fn in ["start_student_exam", "bulk_reset_exams"]:
            if fn in existing_funcs:
                _ok(f"Function: {fn}()")
            else:
                _fail(f"Function: {fn}()", "MISSING — exam start will fail")

        # ── Exam configuration ────────────────────────────────────────────────
        _section("Exam Configuration")

        cfg = await db.fetchrow("SELECT * FROM exam_config WHERE id = 1")
        if not cfg:
            _fail("exam_config row", "missing — INSERT INTO exam_config (id) VALUES (1)")
        else:
            _ok("exam_config row exists")

            if cfg["exam_start_time"] is None:
                _fail("exam_start_time", "not set — every student login returns 503")
            else:
                start_utc = cfg["exam_start_time"].replace(tzinfo=timezone.utc)
                now_utc   = datetime.now(timezone.utc)
                delta_min = (start_utc - now_utc).total_seconds() / 60
                if delta_min < 0:
                    _warn("exam_start_time",
                          f"{cfg['exam_start_time']}  ({abs(delta_min):.0f} min ago)")
                else:
                    _ok("exam_start_time",
                        f"{cfg['exam_start_time']}  (T-{delta_min:.0f} min)")

            dur = cfg["exam_duration_minutes"]
            if dur and dur > 0:
                _ok("exam_duration_minutes", f"{dur} min")
            else:
                _fail("exam_duration_minutes", "not set or zero")

            if cfg["test_mode"]:
                _warn("test_mode", "TRUE — disable before the real exam")
            else:
                _ok("test_mode", "false ✓")

            if cfg.get("enable_ip_check"):
                _warn("enable_ip_check", "enabled — verify all centre IP ranges are correct")
            else:
                _ok("enable_ip_check", "disabled")

        # ── Centres ───────────────────────────────────────────────────────────
        _section("Centres")

        centres = await db.fetch(
            "SELECT id, name_en, allowed_ip_ranges FROM centres ORDER BY id"
        )
        if not centres:
            _warn("Centres", "none configured — students will have no centre_id")
        else:
            _ok("Centres", f"{len(centres)} configured")
            ip_check_on = cfg and cfg.get("enable_ip_check")
            for c in centres:
                ranges = c["allowed_ip_ranges"] or []
                if ip_check_on and not ranges:
                    _warn(f"  '{c['name_en']}'",
                          "IP check is ON but no allowed_ip_ranges set for this centre")
                else:
                    _ok(f"  '{c['name_en']}'",
                        f"{len(ranges)} IP range(s)")

        # ── Admin accounts ────────────────────────────────────────────────────
        _section("Admin Accounts")

        admins = await db.fetch("SELECT username, role FROM admins ORDER BY role")
        superadmins  = [a for a in admins if a["role"] == "admin"]
        invigilators = [a for a in admins if a["role"] == "invigilator"]

        if not superadmins:
            _fail("Superadmin account", "none found — no one can manage the exam")
        else:
            _ok("Superadmin(s)", ", ".join(a["username"] for a in superadmins))

        if not invigilators:
            _warn("Invigilators", "none configured")
        else:
            _ok("Invigilators", f"{len(invigilators)}")

        # ── Students ──────────────────────────────────────────────────────────
        _section("Students")

        stats = await db.fetchrow("""
            SELECT
                COUNT(*)                                          AS total,
                COUNT(*) FILTER (WHERE status = 'pending')       AS pending,
                COUNT(*) FILTER (WHERE status = 'active')        AS active,
                COUNT(*) FILTER (WHERE status = 'flagged')       AS flagged,
                COUNT(*) FILTER (WHERE status = 'submitted')     AS submitted,
                COUNT(*) FILTER (WHERE centre_id IS NULL)        AS no_centre,
                COUNT(*) FILTER (WHERE paper_set IS NULL)        AS no_paper_set,
                COUNT(*) FILTER (WHERE password = '' OR password IS NULL) AS no_password
            FROM students
        """)

        total = stats["total"]
        if total == 0:
            _fail("Students", "none imported — run the admin import first")
        else:
            _ok("Total students", str(total))

        if stats["no_centre"] > 0:
            _warn("Without centre_id", f"{stats['no_centre']} students")
        else:
            _ok("All students have centre_id")

        if stats["no_paper_set"] > 0:
            _fail("Without paper_set", f"{stats['no_paper_set']} — cannot start exam")
        else:
            _ok("All students have paper_set")

        if stats["no_password"] > 0:
            _fail("Without password", f"{stats['no_password']} — cannot log in")
        else:
            _ok("All students have password")

        _ok  ("Status: pending",   str(stats["pending"]))
        (_warn if stats["active"]    > 0 else _ok)("Status: active",
            str(stats["active"]) + (" — exam already in progress for some" if stats["active"] else ""))
        (_warn if stats["flagged"]   > 0 else _ok)("Status: flagged",
            str(stats["flagged"]) + (" — will not be auto-reset" if stats["flagged"] else ""))
        (_warn if stats["submitted"] > 0 else _ok)("Status: submitted",
            str(stats["submitted"]) + (" — these cannot re-take" if stats["submitted"] else ""))

        by_set = await db.fetch("""
            SELECT paper_set, stream, COUNT(*) AS cnt
            FROM students
            GROUP BY paper_set, stream
            ORDER BY paper_set, stream
        """)
        for row in by_set:
            label = f"Paper {row['paper_set']} / {row['stream'] or 'no-stream'}"
            _ok(label, f"{row['cnt']} students")

        # ── Questions ─────────────────────────────────────────────────────────
        _section("Questions")

        papers = await db.fetch("SELECT id, set_code FROM papers ORDER BY set_code")
        if not papers:
            _fail("Papers table", "no A/B rows — run schema.sql")
        else:
            _ok("Papers", " + ".join(p["set_code"] for p in papers))

        q_rows = await db.fetch("""
            SELECT p.set_code, q.section, q.stream,
                   COUNT(*)       AS cnt,
                   SUM(q.marks)   AS total_marks,
                   COUNT(*) FILTER (WHERE q.correct_answer = '' OR q.correct_answer IS NULL)
                                  AS missing_answers
            FROM questions q
            JOIN papers p ON q.paper_id = p.id
            GROUP BY p.set_code, q.section, q.stream
            ORDER BY p.set_code, q.section, q.stream NULLS FIRST
        """)

        if not q_rows:
            _fail("Questions", "none loaded — import questions before the exam")
        else:
            total_q = sum(r["cnt"] for r in q_rows)
            _ok("Total questions", str(total_q))

            # Collect streams that actually have students registered
            registered_streams = {
                row["stream"] for row in by_set if row["stream"]
            }

            for row in q_rows:
                stream_tag = f" [{row['stream']}]" if row["stream"] else ""
                label = f"  Set {row['set_code']}  §{row['section']}{stream_tag}"
                detail = f"{row['cnt']} questions  ·  {row['total_marks']} marks"
                if row["missing_answers"] > 0:
                    _warn(label, detail + f"  ·  {_R}{row['missing_answers']} missing correct_answer{_X}")
                else:
                    _ok(label, detail)

            # Check section 5 coverage: every registered stream needs questions
            sec5_streams = {
                row["stream"]
                for row in q_rows
                if row["section"] == 5 and row["stream"] is not None
            }
            sec5_sets = {
                row["set_code"]
                for row in q_rows
                if row["section"] == 5
            }
            for stream in registered_streams:
                if stream not in sec5_streams:
                    _warn(f"Section 5 / stream '{stream}'",
                          "no questions found — those students will have an empty section")
            for paper in [p["set_code"] for p in papers]:
                if paper not in sec5_sets:
                    _warn(f"Section 5 / paper {paper}", "no questions found")

        # ── Credentials CSV cross-check ───────────────────────────────────────
        _section("Credentials CSV")

        csv_creds, csv_path = _load_csv()
        if not csv_path:
            _warn("CSV file",
                  "not found — skipping credential validation "
                  "(tried: credentials_2026(1).csv, credentials_2026.csv)")
        else:
            _ok("CSV file", f"{len(csv_creds)} rows  ·  {csv_path}")

            db_rows    = await db.fetch("SELECT roll_number, password FROM students")
            db_creds   = {r["roll_number"]: r["password"] for r in db_rows}
            csv_rolls  = set(csv_creds)
            db_rolls   = set(db_creds)

            only_csv = csv_rolls - db_rolls
            only_db  = db_rolls  - csv_rolls
            both     = csv_rolls & db_rolls

            if only_csv:
                _fail("In CSV but not in DB",
                      f"{len(only_csv)}  e.g. {sorted(only_csv)[:3]}")
            else:
                _ok("All CSV students exist in DB")

            if only_db:
                _warn("In DB but not in CSV",
                      f"{len(only_db)}  e.g. {sorted(only_db)[:3]}")
            else:
                _ok("All DB students present in CSV")

            # Password match — check every overlapping student (plain-text passwords)
            mismatches = [
                r for r in both
                if csv_creds[r] != db_creds[r]
            ]
            if mismatches:
                _fail("Password mismatches",
                      f"{len(mismatches)}  e.g. {mismatches[:3]}")
            else:
                _ok("Passwords match", f"verified {len(both)} students")

    await pool.close()
    _print_summary()


def _print_summary() -> None:
    passed = sum(1 for s, _ in _results if s == "PASS")
    warned = sum(1 for s, _ in _results if s == "WARN")
    failed = sum(1 for s, _ in _results if s == "FAIL")

    print(f"\n{_BD}{'─' * 56}")
    print(f"  Summary")
    print(f"{'─' * 56}{_X}")
    print(f"  {_G}PASS{_X} {passed}   {_Y}WARN{_X} {warned}   {_R}FAIL{_X} {failed}")

    if failed > 0:
        print(f"\n  {_R}{_BD}NOT READY — fix the FAIL items before starting the exam.{_X}")
        sys.exit(1)
    elif warned > 0:
        print(f"\n  {_Y}{_BD}READY WITH WARNINGS — review the WARN items above.{_X}")
    else:
        print(f"\n  {_G}{_BD}ALL CLEAR — ready to start the exam.{_X}")
    print()


if __name__ == "__main__":
    asyncio.run(run())
