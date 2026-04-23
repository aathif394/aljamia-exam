"""
Background scheduler — checks every 60 seconds if any exam's results_publish_time
has passed and sends email/SMS notifications to students if configured.

Email: Resend API (configured in admin Settings tab) — preferred if API key is set.
       Falls back to SMTP (env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
SMS:   Twilio REST (env: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM)
"""
import asyncio
import logging
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Resend email ───────────────────────────────────────────────────────────────

async def _send_email_resend(
    api_key: str,
    from_addr: str,
    from_name: str,
    to_addr: str,
    name: str,
    exam_name: str,
    score: float,
    rank: int,
) -> None:
    html = f"""
    <html><body style="font-family:sans-serif;color:#1c1917;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;font-weight:600;margin-bottom:4px">{exam_name} — Results Published</h2>
      <p style="color:#78716c;font-size:14px;margin-top:0">Dear {name}, your scores are now available.</p>
      <div style="border:1px solid #e7e5e4;padding:20px;margin:24px 0;background:#fafaf9">
        <p style="margin:0 0 8px;font-size:14px">Score: <strong style="font-size:20px">{score:.1f}</strong></p>
        <p style="margin:0;font-size:14px">Rank: <strong>#{rank}</strong></p>
      </div>
      <p style="font-size:13px;color:#78716c">Login to the exam portal to view the full leaderboard.</p>
      <p style="font-size:11px;color:#a8a29e;margin-top:32px">ALJ Examination System</p>
    </body></html>
    """
    sender = f"{from_name} <{from_addr}>" if from_name else from_addr
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": sender,
                "to": [to_addr],
                "subject": f"Your {exam_name} Results",
                "html": html,
            },
            timeout=15,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Resend error {resp.status_code}: {resp.text[:200]}")


# ── SMTP email ─────────────────────────────────────────────────────────────────

def _send_email(to_addr: str, name: str, exam_name: str, score: float, rank: int) -> None:
    host    = os.getenv("SMTP_HOST", "")
    port    = int(os.getenv("SMTP_PORT", "587"))
    user    = os.getenv("SMTP_USER", "")
    passwd  = os.getenv("SMTP_PASS", "")
    from_   = os.getenv("SMTP_FROM", user)

    if not host or not user or not passwd:
        logger.warning("SMTP not configured — skipping email to %s", to_addr)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your {exam_name} Results"
    msg["From"]    = from_
    msg["To"]      = to_addr

    text = (
        f"Dear {name},\n\n"
        f"Your results for {exam_name} are now available.\n\n"
        f"Score: {score:.1f}\n"
        f"Rank:  #{rank}\n\n"
        "Login to the exam portal to view the full leaderboard.\n\n"
        "AL Jamia Al Islamiya"
    )
    html = f"""
    <html><body style="font-family:sans-serif;color:#1c1917;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;font-weight:600;margin-bottom:4px">{exam_name} — Results Published</h2>
      <p style="color:#78716c;font-size:14px;margin-top:0">Your scores are now available.</p>
      <div style="border:1px solid #e7e5e4;padding:20px;margin:24px 0;background:#fafaf9">
        <p style="margin:0 0 8px;font-size:14px">Score: <strong style="font-size:20px">{score:.1f}</strong></p>
        <p style="margin:0;font-size:14px">Rank: <strong>#{rank}</strong></p>
      </div>
      <p style="font-size:13px;color:#78716c">Login to the exam portal to view the full leaderboard.</p>
      <p style="font-size:11px;color:#a8a29e;margin-top:32px">ALJ Examination System</p>
    </body></html>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP(host, port) as s:
        s.ehlo()
        s.starttls(context=ctx)
        s.login(user, passwd)
        s.sendmail(from_, to_addr, msg.as_string())


# ── SMS via Twilio ─────────────────────────────────────────────────────────────

async def _send_sms(phone: str, name: str, exam_name: str, score: float) -> None:
    sid    = os.getenv("TWILIO_SID", "")
    token  = os.getenv("TWILIO_TOKEN", "")
    from_  = os.getenv("TWILIO_FROM", "")

    if not sid or not token or not from_:
        logger.warning("Twilio not configured — skipping SMS to %s", phone)
        return

    body = f"Hi {name}, your {exam_name} result: {score:.1f}. View leaderboard at the exam portal."
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            auth=(sid, token),
            data={"From": from_, "To": phone, "Body": body},
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.error("Twilio error %s: %s", resp.status_code, resp.text[:200])


# ── Main scheduler loop ────────────────────────────────────────────────────────

async def run_scheduler(db_pool) -> None:
    """
    Runs forever, checking once per minute for exams whose results should be published
    and for which notifications have not been sent yet.
    """
    logger.info("Scheduler started")
    while True:
        try:
            await _check_and_notify(db_pool)
        except Exception as exc:
            logger.exception("Scheduler error: %s", exc)
        await asyncio.sleep(60)


async def _get_resend_settings(db) -> dict:
    """Fetch Resend config from app_settings table."""
    rows = await db.fetch(
        "SELECT key, value FROM app_settings WHERE key IN ('resend_api_key','resend_from_email','resend_from_name')"
    )
    s = {r["key"]: r["value"] for r in rows}
    return {
        "api_key":    s.get("resend_api_key") or "",
        "from_email": s.get("resend_from_email") or "",
        "from_name":  s.get("resend_from_name") or "ALJ Examination System",
    }


async def _check_and_notify(pool) -> None:
    async with pool.acquire() as db:
        exams = await db.fetch("""
            SELECT id, name, notify_email, notify_sms
            FROM exams
            WHERE results_publish_time IS NOT NULL
              AND results_publish_time <= NOW()
              AND notifications_sent = FALSE
              AND (notify_email = TRUE OR notify_sms = TRUE)
        """)

        if not exams:
            return

        # Load Resend settings once per scheduler run
        resend = await _get_resend_settings(db)
        use_resend = bool(resend["api_key"] and resend["from_email"])

        for exam in exams:
            exam_id   = exam["id"]
            exam_name = exam["name"]
            logger.info("Sending notifications for exam %s (%s)", exam_id, exam_name)

            # Fetch submitted students with scores and ranks
            students = await db.fetch("""
                SELECT s.roll_number, s.name_en, s.phone, s.email, s.score,
                       RANK() OVER (ORDER BY s.score DESC) AS rank
                FROM students s
                WHERE s.exam_id = $1 AND s.status IN ('submitted', 'flagged')
                ORDER BY s.score DESC
            """, exam_id)

            sent = 0
            for s in students:
                score = float(s["score"] or 0)
                rank  = int(s["rank"])
                name  = s["name_en"] or "Student"

                if exam["notify_email"] and s["email"]:
                    try:
                        if use_resend:
                            await _send_email_resend(
                                resend["api_key"], resend["from_email"], resend["from_name"],
                                s["email"], name, exam_name, score, rank,
                            )
                        else:
                            await asyncio.get_event_loop().run_in_executor(
                                None, _send_email, s["email"], name, exam_name, score, rank
                            )
                        sent += 1
                    except Exception as e:
                        logger.error("Email failed for %s: %s", s["roll_number"], e)

                if exam["notify_sms"] and s["phone"]:
                    try:
                        await _send_sms(s["phone"], name, exam_name, score)
                        sent += 1
                    except Exception as e:
                        logger.error("SMS failed for %s: %s", s["roll_number"], e)

            # Mark as sent regardless (avoid retry loops on partial failure)
            await db.execute(
                "UPDATE exams SET notifications_sent = TRUE WHERE id = $1", exam_id
            )
            logger.info("Notifications done for exam %s — %d sent", exam_id, sent)
