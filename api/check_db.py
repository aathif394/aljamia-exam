
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()
DB_DSN = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/examdb")

async def check():
    conn = await asyncpg.connect(DB_DSN)
    rows = await conn.fetch("SELECT roll_number, name_en, dob, phone FROM students LIMIT 5;")
    for r in rows:
        print(dict(r))
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
