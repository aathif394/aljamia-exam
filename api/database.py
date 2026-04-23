import os
import asyncpg
import orjson
from dotenv import load_dotenv

load_dotenv()

# Use a high-performance DSN. Ensure your Postgres server allows 100+ connections.
DB_DSN = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/examdb")

# Global pool instance
db_pool: asyncpg.Pool | None = None


def json_encoder(obj):
    return orjson.dumps(obj).decode()


def json_decoder(data):
    return orjson.loads(data)


async def setup_connection(conn):
    """
    Optimizes every connection in the pool.
    1. Sets up binary JSONB codecs using orjson (massively faster than stdlib json).
    2. Ensures prepared statement caching is active.
    """
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
    # PERFORMANCE TUNING:
    # min_size=20: Keeps 20 connections "hot" and ready at all times. No handshake lag.
    # max_size=100: Cap based on your PG server's max_connections.
    # command_timeout=5.0: Prevents a single hung query from starving the whole pool.
    db_pool = await asyncpg.create_pool(
        dsn=DB_DSN,
        min_size=20,
        max_size=100,
        init=setup_connection,
        command_timeout=5.0,
        max_queries=1000,  # Periodically recycle connections to prevent memory bloat
        max_inactive_connection_lifetime=300.0,
    )


async def close_db():
    if db_pool:
        await db_pool.close()


async def get_db():
    """
    Dependency for FastAPI.
    Using 'async with' ensures the connection is returned to the pool
    immediately after the request, even if an error occurs.
    """
    if db_pool is None:
        await init_db()

    async with db_pool.acquire() as conn:
        yield conn
