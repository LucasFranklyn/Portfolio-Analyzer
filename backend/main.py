from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
import httpx
import os
import aiosqlite
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

FINNHUB_KEY = os.getenv("FINNHUB_KEY")
DB_PATH = "holdings.db"
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey123")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                shares REAL NOT NULL,
                type TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                user_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value REAL NOT NULL,
                PRIMARY KEY (user_id, key)
            )
        """)
        await db.commit()

@app.on_event("startup")
async def startup():
    await init_db()

def create_token(user_id: int, username: str):
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "username": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"id": int(payload["sub"]), "username": payload["username"]}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/register")
async def register(data: dict):
    hashed = pwd_context.hash(data["password"])
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (data["username"], hashed)
            )
            await db.commit()
            token = create_token(cursor.lastrowid, data["username"])
            return {"token": token, "username": data["username"]}
    except Exception:
        raise HTTPException(status_code=400, detail="Username already taken")

@app.post("/api/login")
async def login(data: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE username = ?", (data["username"],)) as cursor:
            user = await cursor.fetchone()
    if not user or not pwd_context.verify(data["password"], user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["username"])
    return {"token": token, "username": user["username"]}

@app.get("/api/holdings")
async def get_holdings(user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM holdings WHERE user_id = ?", (user["id"],)) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

@app.post("/api/holdings")
async def add_holding(holding: dict, user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO holdings (user_id, ticker, shares, type) VALUES (?, ?, ?, ?)",
            (user["id"], holding["ticker"], holding["shares"], holding["type"])
        )
        await db.commit()
        return {"id": cursor.lastrowid, **holding}

@app.delete("/api/holdings/{holding_id}")
async def delete_holding(holding_id: int, user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM holdings WHERE id = ? AND user_id = ?", (holding_id, user["id"]))
        await db.commit()
        return {"deleted": holding_id}

@app.get("/api/settings")
async def get_settings(user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM settings WHERE user_id = ?", (user["id"],)) as cursor:
            rows = await cursor.fetchall()
            return {row["key"]: row["value"] for row in rows}

@app.post("/api/settings")
async def save_settings(data: dict, user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        for key, value in data.items():
            await db.execute(
                "INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)",
                (user["id"], key, value)
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