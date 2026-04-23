import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    dsn = os.getenv("DATABASE_URL")
    conn = await asyncpg.connect(dsn)
    rows = await conn.fetch("SELECT type, correct_answer, options_en FROM questions LIMIT 50")
    print(f"{'TYPE':<15} | {'CORRECT':<15} | {'OPTIONS'}")
    print("-" * 60)
    for r in rows:
        opts = r['options_en'][:50] + "..." if r['options_en'] and len(r['options_en']) > 50 else r['options_en']
        print(f"{r['type']:<15} | {r['correct_answer']:<15} | {opts}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
