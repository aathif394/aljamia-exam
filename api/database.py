import os
import asyncio
import asyncpg
import orjson
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

DB_DSN = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/examdb")

# Global pool instance
db_pool: asyncpg.Pool | None = None


def json_encoder(obj):
    return orjson.dumps(obj).decode()


def json_decoder(data):
    return orjson.loads(data)


async def setup_connection(conn):
    await conn.set_type_codec(
        "jsonb",
        encoder=json_encoder,
        decoder=json_decoder,
        schema="pg_catalog",
        format="text",
    )
    await conn.set_type_codec(
        "json",
        encoder=json_encoder,
        decoder=json_decoder,
        schema="pg_catalog",
        format="text",
    )


async def init_db():
    global db_pool
    # 2 uvicorn workers × 25 = 50 physical connections through Neon pooler.
    # Point DATABASE_URL at the Neon pooler endpoint (*-pooler.neon.tech) so
    # Neon's PgBouncer multiplexes these 50 connections across all 500 students.
    # Direct (non-pooler) endpoint: keep max_size ≤ 20 to stay under Neon's limit.
    # statement_cache_size=0 required when DATABASE_URL points at Neon's PgBouncer
    # pooler (transaction mode). PgBouncer doesn't persist prepared statements
    # across transactions, so asyncpg's default caching causes unhandled errors.
    db_pool = await asyncpg.create_pool(
        dsn=DB_DSN,
        min_size=5,
        max_size=25,
        init=setup_connection,
        command_timeout=8.0,
        max_queries=50000,
        max_inactive_connection_lifetime=300.0,
        statement_cache_size=0,
    )


async def close_db():
    if db_pool:
        await db_pool.close()


async def get_db():
    if db_pool is None:
        await init_db()

    try:
        async with db_pool.acquire(timeout=15.0) as conn:
            yield conn
    except asyncio.TimeoutError:
        raise HTTPException(503, "Server busy — please retry")
    except asyncpg.TooManyConnectionsError:
        raise HTTPException(503, "Server busy — please retry")
    except asyncpg.PostgresError as e:
        raise HTTPException(503, f"Database error: {e}")
