from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import aiosqlite
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FINNHUB_KEY = os.getenv("FINNHUB_KEY")
DB_PATH = "holdings.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                shares REAL NOT NULL,
                type TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value REAL NOT NULL
            )
        """)
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('goal', 10000)")
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('weeklyDeposit', 100)")
        await db.commit()

@app.on_event("startup")
async def startup():
    await init_db()

@app.get("/api/holdings")
async def get_holdings():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM holdings") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

@app.post("/api/holdings")
async def add_holding(holding: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO holdings (ticker, shares, type) VALUES (?, ?, ?)",
            (holding["ticker"], holding["shares"], holding["type"])
        )
        await db.commit()
        return {"id": cursor.lastrowid, **holding}

@app.delete("/api/holdings/{holding_id}")
async def delete_holding(holding_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
        await db.commit()
        return {"deleted": holding_id}

@app.get("/api/settings")
async def get_settings():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM settings") as cursor:
            rows = await cursor.fetchall()
            return {row["key"]: row["value"] for row in rows}

@app.post("/api/settings")
async def save_settings(data: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        for key, value in data.items():
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, value)
            )
        await db.commit()
        return data

@app.get("/api/prices")
async def get_prices(tickers: str):
    symbols = [t.strip().upper() for t in tickers.split(",")]
    prices = {}
    async with httpx.AsyncClient() as client:
        for symbol in symbols:
            try:
                r = await client.get(
                    "https://finnhub.io/api/v1/quote",
                    params={"symbol": symbol, "token": FINNHUB_KEY}
                )
                data = r.json()
                prices[symbol] = data.get("c", 0)
            except:
                prices[symbol] = 0
    return prices
