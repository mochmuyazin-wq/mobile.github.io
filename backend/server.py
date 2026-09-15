import os
import re
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Annotated, List, Optional

import httpx
import jwt
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
import certifi

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "43200"))

mongo_client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = mongo_client[DB_NAME]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("dompetberdua")

app = FastAPI(title="DompetKita API")
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Mongo document models (ObjectId is never returned raw)
# ---------------------------------------------------------------------------

def _oid_to_str(v):
    return str(v) if isinstance(v, ObjectId) else v


PyObjectId = Annotated[Optional[str], BeforeValidator(_oid_to_str)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: PyObjectId = Field(default=None, alias="_id")

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("_id", None)
        return data

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls(**doc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserDoc(BaseDocument):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    password_hash: Optional[str] = None
    wallet_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class WalletDoc(BaseDocument):
    name: str = "Dompet Bersama"
    member_ids: List[str] = Field(default_factory=list)
    invite_code: Optional[str] = None
    invite_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    deleted_at: Optional[datetime] = None


class CategoryDoc(BaseDocument):
    wallet_id: str
    name: str
    icon: str = "pricetag"
    created_at: datetime = Field(default_factory=utcnow)
    deleted_at: Optional[datetime] = None


class TransactionDoc(BaseDocument):
    wallet_id: str
    type: str  # "income" | "expense"
    amount: int
    category_id: str
    category_name: str
    category_icon: str
    date: str  # "YYYY-MM-DD" (device-local date of the transaction)
    note: Optional[str] = None
    created_by: str
    created_by_name: str
    receipt_path: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    deleted_at: Optional[datetime] = None


class BudgetDoc(BaseDocument):
    wallet_id: str
    category_id: str
    month: str  # "YYYY-MM"
    limit_amount: int
    warned_80: bool = False
    warned_100: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    deleted_at: Optional[datetime] = None


class NotificationDoc(BaseDocument):
    user_id: str
    wallet_id: str
    title: str
    message: str
    type: str  # "transaction" | "budget" | "pairing"
    ref_id: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    identifier: str = Field(min_length=5, max_length=80)
    password: str = Field(min_length=8, max_length=72)


class LoginBody(BaseModel):
    identifier: str = Field(min_length=5, max_length=80)
    password: str = Field(min_length=1, max_length=72)


class JoinBody(BaseModel):
    code: str = Field(min_length=4, max_length=10)


class CategoryBody(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    icon: str = Field(default="pricetag", max_length=40)


class TransactionBody(BaseModel):
    type: str
    amount: int = Field(ge=1)
    category_id: str
    date: str
    note: Optional[str] = Field(default=None, max_length=200)
    receipt_path: Optional[str] = None


class TransactionUpdateBody(BaseModel):
    type: Optional[str] = None
    amount: Optional[int] = Field(default=None, ge=1)
    category_id: Optional[str] = None
    date: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=200)


class BudgetBody(BaseModel):
    category_id: str
    month: str
    limit_amount: int = Field(ge=0)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+\.[\w.\-]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")

DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.3J7M0u7J0yN3l6C0JxD4k8nZ4uK6K6S"

DEFAULT_CATEGORIES = [
    ("Makan", "restaurant"),
    ("Transport", "car"),
    ("Tagihan", "receipt"),
    ("Hiburan", "game-controller"),
    ("Tabungan", "wallet"),
    ("Belanja", "cart"),
    ("Kesehatan", "medkit"),
    ("Lainnya", "ellipsis-horizontal"),
]


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        raise ValueError("Nomor HP tidak valid")
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    elif digits.startswith("8"):
        digits = "62" + digits
    if not re.fullmatch(r"\d{9,15}", digits):
        raise ValueError("Nomor HP tidak valid, contoh: 081234567890")
    return "+" + digits


def detect_identifier(identifier: str) -> tuple[str, str]:
    raw = (identifier or "").strip()
    if "@" in raw:
        email = raw.lower()
        if not EMAIL_RE.fullmatch(email):
            raise ValueError("Email tidak valid")
        return "email", email
    return "phone", normalize_phone(raw)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        return False


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES), "typ": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Missing bearer token")
    return await resolve_user(credentials.credentials)


async def resolve_user(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"require": ["sub", "exp", "iat"]})
        user_id = ObjectId(payload["sub"])
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(401, "Sesi berakhir, silakan login kembali")
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(401, "Pengguna tidak ditemukan")
    return user


def public_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name"),
        "email": doc.get("email"),
        "phone": doc.get("phone"),
        "wallet_id": doc.get("wallet_id"),
    }


def tx_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "type": doc["type"],
        "amount": doc["amount"],
        "category_id": doc["category_id"],
        "category_name": doc["category_name"],
        "category_icon": doc["category_icon"],
        "date": doc["date"],
        "note": doc.get("note"),
        "created_by": doc["created_by"],
        "created_by_name": doc["created_by_name"],
        "receipt_path": doc.get("receipt_path"),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


async def get_wallet_or_404(user: dict) -> dict:
    wallet = await db.wallets.find_one({"_id": ObjectId(user["wallet_id"])})
    if not wallet:
        raise HTTPException(404, "Dompet tidak ditemukan")
    return wallet


async def wallet_member_ids(wallet: dict) -> List[str]:
    return list(wallet.get("member_ids") or [])


def scope_member_ids(member_ids: List[str], user_id: str, owner: str) -> List[str]:
    if owner == "me":
        return [user_id]
    if owner == "partner":
        return [m for m in member_ids if m != user_id]
    return member_ids


def period_range(period: str, ref: str) -> tuple[str, str]:
    d = date.fromisoformat(ref)
    if period == "day":
        return d.isoformat(), d.isoformat()
    if period == "week":
        start = d - timedelta(days=d.weekday())
        return start.isoformat(), (start + timedelta(days=6)).isoformat()
    start = d.replace(day=1)
    if start.month == 12:
        nxt = date(start.year + 1, 1, 1)
    else:
        nxt = date(start.year, start.month + 1, 1)
    return start.isoformat(), (nxt - timedelta(days=1)).isoformat()


def rupiah(amount: int) -> str:
    return f"Rp{amount:,}".replace(",", ".")


async def notify(user_ids: List[str], wallet_id: str, title: str, message: str, ntype: str, ref_id: str | None = None):
    docs = [
        NotificationDoc(user_id=uid, wallet_id=wallet_id, title=title, message=message, type=ntype, ref_id=ref_id).to_mongo()
        for uid in user_ids
        if uid
    ]
    if docs:
        await db.notifications.insert_many(docs)


# ---------------------------------------------------------------------------
# Emergent push relay (managed service)
# ---------------------------------------------------------------------------

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


class RegisterPushBodyIn(BaseModel):
    user_id: str
    platform: str
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: List[str], data: dict, idempotency_key: str | None = None) -> None:
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# Emergent Object Storage (receipt photos)
# ---------------------------------------------------------------------------

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "dompetberdua"
storage_key = None


def init_storage() -> str:
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        global storage_key
        storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


ALLOWED_IMAGE_EXT = {"jpg", "jpeg", "png", "webp", "heic"}


@api_router.post("/upload", status_code=201)
async def upload_receipt(file: UploadFile = File(...), user: dict = Depends(current_user)):
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Ukuran foto maksimal 5MB")
    content_type = file.content_type or "image/jpeg"
    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")
    path = f"{APP_NAME}/uploads/{user['_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except Exception as exc:
        logger.warning("Upload failed: %s", exc)
        raise HTTPException(502, "Gagal mengunggah foto, coba lagi")
    await db.files.insert_one({"path": path, "wallet_id": user["wallet_id"], "owner_id": str(user["_id"]), "content_type": content_type, "created_at": utcnow()})
    return {"path": path}


@api_router.get("/files/{path:path}")
async def download_file(
    path: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    token: str | None = Query(None),
):
    # Auth via Bearer header OR ?token= query (web <img> tags cannot send headers).
    raw = token or (credentials.credentials if credentials else None)
    if not raw:
        raise HTTPException(401, "Missing auth token")
    user = await resolve_user(raw)
    file_doc = await db.files.find_one({"path": path})
    if not file_doc or file_doc.get("wallet_id") != user["wallet_id"]:
        raise HTTPException(404, "File tidak ditemukan")
    try:
        key = init_storage()
    except Exception as exc:
        logger.warning("Storage init failed: %s", exc)
        raise HTTPException(502, "Gagal memuat file")
    try:
        def _fetch_object():
            return requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)

        resp = await run_in_threadpool(_fetch_object)
    except Exception as exc:
        logger.warning("File read failed: %s", exc)
        raise HTTPException(502, "Gagal memuat file")
    if resp.status_code != 200:
        raise HTTPException(404, "File tidak ditemukan")
    return Response(
        content=resp.content,
        media_type=file_doc.get("content_type", "image/jpeg"),
        headers={"Cache-Control": "private, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@api_router.post("/auth/register", status_code=201)
async def register(body: RegisterBody):
    try:
        kind, value = detect_identifier(body.identifier)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    doc = UserDoc(name=body.name.strip(), password_hash=hash_password(body.password), wallet_id=None)
    if kind == "email":
        doc.email = value
    else:
        doc.phone = value
    try:
        result = await db.users.insert_one(doc.to_mongo())
    except Exception:
        raise HTTPException(409, "Email atau nomor HP sudah terdaftar")
    user_id = str(result.inserted_id)
    wallet_id = await create_wallet_for_user(user_id)
    await db.users.update_one({"_id": result.inserted_id}, {"$set": {"wallet_id": wallet_id}})
    token = create_access_token(user_id)
    user_doc = await db.users.find_one({"_id": result.inserted_id})
    return {"access_token": token, "token_type": "bearer", "user": public_user(user_doc)}


@api_router.post("/auth/login")
async def login(body: LoginBody):
    try:
        kind, value = detect_identifier(body.identifier)
    except ValueError:
        raise HTTPException(401, "Email/No. HP atau password salah")
    user = await db.users.find_one({kind: value})
    if not user:
        verify_password(body.password, DUMMY_HASH)
        raise HTTPException(401, "Email/No. HP atau password salah")
    if not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email/No. HP atau password salah")
    token = create_access_token(str(user["_id"]))
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@api_router.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


# ---------------------------------------------------------------------------
# Wallet & pairing
# ---------------------------------------------------------------------------

async def create_wallet_for_user(user_id: str) -> str:
    wallet = WalletDoc(member_ids=[user_id])
    result = await db.wallets.insert_one(wallet.to_mongo())
    wallet_id = str(result.inserted_id)
    for name, icon in DEFAULT_CATEGORIES:
        await db.categories.insert_one(CategoryDoc(wallet_id=wallet_id, name=name, icon=icon).to_mongo())
    return wallet_id


@api_router.get("/wallet")
async def get_wallet(user: dict = Depends(current_user)):
    wallet = await get_wallet_or_404(user)
    members = await db.users.find({"wallet_id": user["wallet_id"]}).to_list(10)
    invite = None
    if len(members) < 2 and wallet.get("invite_code"):
        invite = {
            "code": wallet["invite_code"],
            "expires_at": wallet["invite_expires_at"].isoformat() if isinstance(wallet.get("invite_expires_at"), datetime) else None,
        }
    return {"id": str(wallet["_id"]), "name": wallet["name"], "members": [public_user(m) for m in members], "invite": invite}


@api_router.post("/wallet/invite")
async def create_invite(user: dict = Depends(current_user)):
    wallet = await get_wallet_or_404(user)
    if len(wallet.get("member_ids") or []) >= 2:
        raise HTTPException(400, "Dompet ini sudah terhubung dengan dua akun")
    code = None
    for _ in range(10):
        candidate = f"{secrets.randbelow(1000000):06d}"
        exists = await db.wallets.find_one({"invite_code": candidate, "invite_expires_at": {"$gt": utcnow()}})
        if not exists:
            code = candidate
            break
    if not code:
        raise HTTPException(503, "Coba lagi sebentar")
    expires = utcnow() + timedelta(hours=24)
    await db.wallets.update_one({"_id": wallet["_id"]}, {"$set": {"invite_code": code, "invite_expires_at": expires}})
    return {"code": code, "expires_at": expires.isoformat()}


@api_router.post("/wallet/join")
async def join_wallet(body: JoinBody, user: dict = Depends(current_user)):
    wallet = await db.wallets.find_one({"invite_code": body.code.strip(), "invite_expires_at": {"$gt": utcnow()}})
    if not wallet:
        raise HTTPException(404, "Kode undangan tidak valid atau kedaluwarsa")
    if str(wallet["_id"]) == user.get("wallet_id"):
        raise HTTPException(400, "Itu kode dompet kamu sendiri")
    if len(wallet.get("member_ids") or []) >= 2:
        raise HTTPException(400, "Dompet ini sudah terhubung dengan dua akun")

    user_id = str(user["_id"])
    old_wallet_id = user["wallet_id"]
    new_wallet_id = str(wallet["_id"])

    # Migrate the joiner's transactions into the shared wallet.
    await db.transactions.update_many({"wallet_id": old_wallet_id}, {"$set": {"wallet_id": new_wallet_id}})

    # Merge categories: reuse a same-named category in the shared wallet when possible.
    joiner_cats = await db.categories.find({"wallet_id": old_wallet_id, "deleted_at": None}).to_list(None)
    target_cats = await db.categories.find({"wallet_id": new_wallet_id, "deleted_at": None}).to_list(None)
    target_by_name = {c["name"].strip().lower(): c for c in target_cats}
    cat_mapping: dict[str, str] = {}
    for c in joiner_cats:
        old_cat_id = str(c["_id"])
        match = target_by_name.get(c["name"].strip().lower())
        if match:
            new_cat_id = str(match["_id"])
            await db.transactions.update_many(
                {"category_id": old_cat_id},
                {"$set": {"category_id": new_cat_id, "category_name": match["name"], "category_icon": match["icon"]}},
            )
            await db.categories.update_one({"_id": c["_id"]}, {"$set": {"deleted_at": utcnow()}})
        else:
            new_cat = CategoryDoc(wallet_id=new_wallet_id, name=c["name"], icon=c.get("icon", "pricetag"))
            res = await db.categories.insert_one(new_cat.to_mongo())
            new_cat_id = str(res.inserted_id)
            await db.transactions.update_many({"category_id": old_cat_id}, {"$set": {"category_id": new_cat_id}})
            await db.categories.update_one({"_id": c["_id"]}, {"$set": {"deleted_at": utcnow()}})
        cat_mapping[old_cat_id] = new_cat_id

    # Migrate budgets.
    joiner_budgets = await db.budgets.find({"wallet_id": old_wallet_id, "deleted_at": None}).to_list(None)
    for b in joiner_budgets:
        mapped_cat = cat_mapping.get(b["category_id"], b["category_id"])
        exists = await db.budgets.find_one({"wallet_id": new_wallet_id, "category_id": mapped_cat, "month": b["month"], "deleted_at": None})
        if exists:
            await db.budgets.update_one({"_id": b["_id"]}, {"$set": {"deleted_at": utcnow()}})
        else:
            await db.budgets.update_one({"_id": b["_id"]}, {"$set": {"wallet_id": new_wallet_id, "category_id": mapped_cat}})
            await db.budgets.update_one({"_id": b["_id"]}, {"$set": {"category_id": mapped_cat, "wallet_id": new_wallet_id}})

    await db.wallets.update_one(
        {"_id": wallet["_id"]},
        {"$set": {"member_ids": list(wallet["member_ids"]) + [user_id], "invite_code": None, "invite_expires_at": None}},
    )
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"wallet_id": new_wallet_id}})
    await db.wallets.update_one({"_id": ObjectId(old_wallet_id)}, {"$set": {"deleted_at": utcnow()}})

    member_user_ids = list(wallet["member_ids"])
    await notify(member_user_ids, new_wallet_id, "Pasangan terhubung", f"{user['name']} bergabung ke dompet bersama", "pairing")
    try:
        await send_push(
            recipients=member_user_ids,
            data={"title": "Pasangan terhubung", "message": f"{user['name']} bergabung ke dompet bersama", "action_url": "/profil"},
        )
    except Exception as exc:
        logger.warning("Push failed (non-blocking): %s", exc)
    return {"id": new_wallet_id, "name": wallet["name"], "members": member_user_ids + [user_id]}


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@api_router.get("/categories")
async def list_categories(user: dict = Depends(current_user)):
    cats = await db.categories.find({"wallet_id": user["wallet_id"], "deleted_at": None}).sort("created_at", 1).to_list(100)
    return [{"id": str(c["_id"]), "name": c["name"], "icon": c.get("icon", "pricetag")} for c in cats]


@api_router.post("/categories", status_code=201)
async def create_category(body: CategoryBody, user: dict = Depends(current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Nama kategori wajib diisi")
    exists = await db.categories.find_one({"wallet_id": user["wallet_id"], "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "deleted_at": None})
    if exists:
        raise HTTPException(409, "Kategori dengan nama itu sudah ada")
    doc = CategoryDoc(wallet_id=user["wallet_id"], name=name, icon=body.icon or "pricetag")
    result = await db.categories.insert_one(doc.to_mongo())
    return {"id": str(result.inserted_id), "name": name, "icon": doc.icon}


@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(current_user)):
    try:
        cat_oid = ObjectId(category_id)
    except Exception:
        raise HTTPException(404, "Kategori tidak ditemukan")
    cat = await db.categories.find_one({"_id": cat_oid, "wallet_id": user["wallet_id"]})
    if not cat:
        raise HTTPException(404, "Kategori tidak ditemukan")
    now = utcnow()
    await db.categories.update_one({"_id": cat_oid}, {"$set": {"deleted_at": now}})
    await db.budgets.update_many({"category_id": category_id, "deleted_at": None}, {"$set": {"deleted_at": now}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@api_router.get("/transactions")
async def list_transactions(
    user: dict = Depends(current_user),
    owner: str = "all",
    type: Optional[str] = None,
    category_id: Optional[str] = None,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(500, ge=1, le=1000),
    skip: int = Query(0, ge=0),
):
    wallet = await get_wallet_or_404(user)
    member_ids = await wallet_member_ids(wallet)
    query: dict = {"wallet_id": user["wallet_id"], "deleted_at": None}
    scope = scope_member_ids(member_ids, str(user["_id"]), owner if owner in ("me", "partner", "all") else "all")
    query["created_by"] = {"$in": scope} if scope else {"$in": ["__none__"]}
    if type in ("income", "expense"):
        query["type"] = type
    if category_id:
        query["category_id"] = category_id
    date_filter: dict = {}
    if from_ and DATE_RE.fullmatch(from_):
        date_filter["$gte"] = from_
    if to and DATE_RE.fullmatch(to):
        date_filter["$lte"] = to
    if date_filter:
        query["date"] = date_filter
    if q:
        escaped = re.escape(q.strip())
        query["$or"] = [
            {"note": {"$regex": escaped, "$options": "i"}},
            {"category_name": {"$regex": escaped, "$options": "i"}},
        ]
    total = await db.transactions.count_documents(query)
    docs = await db.transactions.find(query).sort([("date", -1), ("created_at", -1)]).skip(skip).limit(limit).to_list(limit)
    return {"items": [tx_out(d) for d in docs], "total": total}


async def budget_alerts_for_transaction(wallet_id: str, member_ids: List[str], tx: dict):
    month = tx["date"][:7]
    budget = await db.budgets.find_one({"wallet_id": wallet_id, "category_id": tx["category_id"], "month": month, "deleted_at": None})
    if not budget or budget["limit_amount"] <= 0:
        return
    agg = db.transactions.aggregate(
        [
            {"$match": {"wallet_id": wallet_id, "deleted_at": None, "type": "expense", "category_id": tx["category_id"], "date": {"$regex": f"^{month}"}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
    )
    rows = await agg.to_list(1)
    spent = rows[0]["total"] if rows else 0
    limit = budget["limit_amount"]
    pct = spent / limit
    flags: dict = {}
    if pct >= 1 and not budget.get("warned_100"):
        flags = {"warned_100": True, "warned_80": True}
        title = "Anggaran terlampaui"
        message = f"Anggaran {tx['category_name']} sudah lewat limit ({int(pct * 100)}%)"
    elif pct >= 0.8 and not budget.get("warned_80"):
        flags = {"warned_80": True}
        title = "Anggaran hampir habis"
        message = f"Anggaran {tx['category_name']} sudah terpakai {int(pct * 100)}%"
    if not flags:
        return
    await db.budgets.update_one({"_id": budget["_id"]}, {"$set": flags})
    await notify(member_ids, wallet_id, title, message, "budget", str(budget["_id"]))
    try:
        await send_push(
            recipients=member_ids,
            data={"title": title, "message": message, "action_url": "/anggaran"},
            idempotency_key=f"budget-{budget['_id']}-{flags.get('warned_100') and '100' or '80'}",
        )
    except Exception as exc:
        logger.warning("Push failed (non-blocking): %s", exc)


@api_router.post("/transactions", status_code=201)
async def create_transaction(body: TransactionBody, user: dict = Depends(current_user)):
    wallet = await get_wallet_or_404(user)
    if body.type not in ("income", "expense"):
        raise HTTPException(422, "Jenis transaksi tidak valid")
    if not DATE_RE.fullmatch(body.date or ""):
        raise HTTPException(422, "Tanggal tidak valid")
    cat = await db.categories.find_one({"_id": ObjectId(body.category_id), "wallet_id": user["wallet_id"], "deleted_at": None}) if ObjectId.is_valid(body.category_id) else None
    if not cat:
        raise HTTPException(422, "Kategori tidak ditemukan")
    doc = TransactionDoc(
        wallet_id=user["wallet_id"],
        type=body.type,
        amount=int(body.amount),
        category_id=str(cat["_id"]),
        category_name=cat["name"],
        category_icon=cat.get("icon", "pricetag"),
        date=body.date,
        note=(body.note or "").strip() or None,
        created_by=str(user["_id"]),
        created_by_name=user["name"],
        receipt_path=body.receipt_path,
    )
    result = await db.transactions.insert_one(doc.to_mongo())
    tx_doc = await db.transactions.find_one({"_id": result.inserted_id})
    member_ids = await wallet_member_ids(wallet)
    partner_id = [m for m in member_ids if m != str(user["_id"])]
    label = "Pemasukan" if body.type == "income" else "Pengeluaran"
    if partner_id:
        title = user["name"] or "Pasangan"
        message = f"{label} baru {rupiah(body.amount)} - {cat['name']}"
        await notify(partner_id, user["wallet_id"], title, message, "transaction", str(result.inserted_id))
        try:
            await send_push(
                recipients=partner_id,
                data={"title": title, "message": message, "action_url": "/riwayat"},
                idempotency_key=f"tx-{result.inserted_id}",
            )
        except Exception as exc:
            logger.warning("Push failed (non-blocking): %s", exc)
    await budget_alerts_for_transaction(user["wallet_id"], member_ids, tx_doc)
    return tx_out(tx_doc)


async def reset_budget_flags_if_below(wallet_id: str, category_id: str, month: str):
    """Reset the 80%/100% warning flags when spending dropped below the thresholds."""
    budget = await db.budgets.find_one({"wallet_id": wallet_id, "category_id": category_id, "month": month, "deleted_at": None})
    if not budget or budget["limit_amount"] <= 0:
        return
    agg = db.transactions.aggregate(
        [
            {"$match": {"wallet_id": wallet_id, "deleted_at": None, "type": "expense", "category_id": category_id, "date": {"$regex": f"^{month}"}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
    )
    rows = await agg.to_list(1)
    pct = (rows[0]["total"] if rows else 0) / budget["limit_amount"]
    if pct < 0.8 and (budget.get("warned_80") or budget.get("warned_100")):
        await db.budgets.update_one({"_id": budget["_id"]}, {"$set": {"warned_80": False, "warned_100": False}})


@api_router.patch("/transactions/{tx_id}")
async def update_transaction(tx_id: str, body: TransactionUpdateBody, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(tx_id):
        raise HTTPException(404, "Transaksi tidak ditemukan")
    tx = await db.transactions.find_one({"_id": ObjectId(tx_id), "wallet_id": user["wallet_id"], "deleted_at": None})
    if not tx:
        raise HTTPException(404, "Transaksi tidak ditemukan")

    updates: dict = {}
    if body.type is not None:
        if body.type not in ("income", "expense"):
            raise HTTPException(422, "Jenis transaksi tidak valid")
        updates["type"] = body.type
    if body.amount is not None:
        if body.amount < 1:
            raise HTTPException(422, "Nominal tidak valid")
        updates["amount"] = int(body.amount)
    if body.date is not None:
        if not DATE_RE.fullmatch(body.date):
            raise HTTPException(422, "Tanggal tidak valid")
        updates["date"] = body.date
    if body.category_id is not None:
        if not ObjectId.is_valid(body.category_id):
            raise HTTPException(422, "Kategori tidak ditemukan")
        cat = await db.categories.find_one({"_id": ObjectId(body.category_id), "wallet_id": user["wallet_id"], "deleted_at": None})
        if not cat:
            raise HTTPException(422, "Kategori tidak ditemukan")
        updates["category_id"] = str(cat["_id"])
        updates["category_name"] = cat["name"]
        updates["category_icon"] = cat.get("icon", "pricetag")
    if body.note is not None:
        updates["note"] = body.note.strip() or None

    old_cat_id, old_month = tx["category_id"], tx["date"][:7]
    await db.transactions.update_one({"_id": tx["_id"]}, {"$set": updates})
    tx_doc = await db.transactions.find_one({"_id": tx["_id"]})

    wallet = await get_wallet_or_404(user)
    member_ids = await wallet_member_ids(wallet)
    # Budget flags may be stale on the old category (spending moved away) ...
    await reset_budget_flags_if_below(user["wallet_id"], old_cat_id, old_month)
    new_cat_id, new_month = tx_doc["category_id"], tx_doc["date"][:7]
    if (new_cat_id, new_month) != (old_cat_id, old_month):
        await reset_budget_flags_if_below(user["wallet_id"], new_cat_id, new_month)
    # ... and the new spend may cross a threshold.
    await budget_alerts_for_transaction(user["wallet_id"], member_ids, tx_doc)
    return tx_out(tx_doc)


@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(tx_id):
        raise HTTPException(404, "Transaksi tidak ditemukan")
    tx = await db.transactions.find_one({"_id": ObjectId(tx_id), "wallet_id": user["wallet_id"], "deleted_at": None})
    if not tx:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    await db.transactions.update_one({"_id": tx["_id"]}, {"$set": {"deleted_at": utcnow()}})
    await reset_budget_flags_if_below(user["wallet_id"], tx["category_id"], tx["date"][:7])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Summary & budgets
# ---------------------------------------------------------------------------

@api_router.get("/summary")
async def summary(
    user: dict = Depends(current_user),
    period: str = "month",
    ref: Optional[str] = None,
    owner: str = "all",
):
    wallet = await get_wallet_or_404(user)
    member_ids = await wallet_member_ids(wallet)
    user_id = str(user["_id"])
    scope = scope_member_ids(member_ids, user_id, owner if owner in ("me", "partner", "all") else "all")
    ref_date = ref if ref and DATE_RE.fullmatch(ref) else date.today().isoformat()
    start, end = period_range(period, ref_date)

    six_months_ago = (date.fromisoformat(ref_date).replace(day=1) - timedelta(days=1)).replace(day=1)
    for _ in range(4):
        six_months_ago = (six_months_ago - timedelta(days=1)).replace(day=1)
    docs = await db.transactions.find(
        {"wallet_id": user["wallet_id"], "deleted_at": None, "date": {"$gte": six_months_ago.isoformat()}},
        {"type": 1, "amount": 1, "category_name": 1, "date": 1, "created_by": 1},
    ).to_list(None)
    scoped = [d for d in docs if d["created_by"] in scope]

    balance_rows = await db.transactions.aggregate(
        [
            {"$match": {"wallet_id": user["wallet_id"], "deleted_at": None, "created_by": {"$in": scope}}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]
    ).to_list(None)
    balance = sum(r["total"] for r in balance_rows if r["_id"] == "income") - sum(r["total"] for r in balance_rows if r["_id"] == "expense")

    in_period = [d for d in scoped if start <= d["date"] <= end]
    income = sum(d["amount"] for d in in_period if d["type"] == "income")
    expense = sum(d["amount"] for d in in_period if d["type"] == "expense")

    by_cat: dict[str, int] = {}
    for d in in_period:
        if d["type"] == "expense":
            by_cat[d["category_name"]] = by_cat.get(d["category_name"], 0) + d["amount"]
    by_category = [{"name": k, "value": v} for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1])]

    trend: dict[str, dict] = {}
    cur = six_months_ago
    months: list[str] = []
    for _ in range(6):
        months.append(cur.isoformat()[:7])
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
    for m in months:
        trend[m] = {"month": m, "income": 0, "expense": 0}
    for d in scoped:
        m = d["date"][:7]
        if m in trend:
            trend[m]["income" if d["type"] == "income" else "expense"] += d["amount"]

    return {
        "balance": balance,
        "income": income,
        "expense": expense,
        "by_category": by_category,
        "trend": [trend[m] for m in months],
    }


@api_router.get("/budgets")
async def list_budgets(user: dict = Depends(current_user), month: Optional[str] = None):
    month = month if month and MONTH_RE.fullmatch(month) else date.today().isoformat()[:7]
    budgets = await db.budgets.find({"wallet_id": user["wallet_id"], "month": month, "deleted_at": None}).to_list(100)
    cat_ids = [b["category_id"] for b in budgets]
    cats = {str(c["_id"]): c async for c in db.categories.find({"_id": {"$in": [ObjectId(i) for i in cat_ids if ObjectId.is_valid(i)]}})} if False else None
    # (kept simple: fetch categories one query)
    cat_docs = await db.categories.find({"wallet_id": user["wallet_id"]}).to_list(100)
    cat_map = {str(c["_id"]): c for c in cat_docs}
    agg = db.transactions.aggregate(
        [
            {"$match": {"wallet_id": user["wallet_id"], "deleted_at": None, "type": "expense", "date": {"$regex": f"^{month}"}}},
            {"$group": {"_id": "$category_id", "total": {"$sum": "$amount"}}},
        ]
    )
    spent_map = {r["_id"]: r["total"] async for r in agg}
    items = []
    for b in budgets:
        cat = cat_map.get(b["category_id"])
        spent = spent_map.get(b["category_id"], 0)
        limit = b["limit_amount"]
        pct = spent / limit if limit > 0 else 0
        items.append(
            {
                "id": str(b["_id"]),
                "category_id": b["category_id"],
                "category_name": cat["name"] if cat else "Kategori",
                "category_icon": (cat or {}).get("icon", "pricetag"),
                "limit_amount": limit,
                "spent": spent,
                "pct": round(pct, 4),
                "status": "exceeded" if pct >= 1 else ("warning" if pct >= 0.8 else "ok"),
            }
        )
    items.sort(key=lambda x: -x["pct"])
    return {"month": month, "items": items}


@api_router.put("/budgets")
async def upsert_budget(body: BudgetBody, user: dict = Depends(current_user)):
    if not MONTH_RE.fullmatch(body.month or ""):
        raise HTTPException(422, "Bulan tidak valid")
    if not ObjectId.is_valid(body.category_id):
        raise HTTPException(422, "Kategori tidak ditemukan")
    cat = await db.categories.find_one({"_id": ObjectId(body.category_id), "wallet_id": user["wallet_id"], "deleted_at": None})
    if not cat:
        raise HTTPException(422, "Kategori tidak ditemukan")
    existing = await db.budgets.find_one({"wallet_id": user["wallet_id"], "category_id": body.category_id, "month": body.month, "deleted_at": None})
    if body.limit_amount == 0:
        if existing:
            await db.budgets.update_one({"_id": existing["_id"]}, {"$set": {"deleted_at": utcnow()}})
        return {"ok": True}
    if existing:
        await db.budgets.update_one({"_id": existing["_id"]}, {"$set": {"limit_amount": body.limit_amount, "warned_80": False, "warned_100": False}})
        return {"ok": True}
    doc = BudgetDoc(wallet_id=user["wallet_id"], category_id=body.category_id, month=body.month, limit_amount=body.limit_amount)
    await db.budgets.insert_one(doc.to_mongo())
    return {"ok": True}


@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, user: dict = Depends(current_user)):
    if not ObjectId.is_valid(budget_id):
        raise HTTPException(404, "Anggaran tidak ditemukan")
    await db.budgets.update_one({"_id": ObjectId(budget_id), "wallet_id": user["wallet_id"]}, {"$set": {"deleted_at": utcnow()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(current_user)):
    items = await db.notifications.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({"user_id": str(user["_id"]), "read": False})
    return {
        "items": [
            {
                "id": str(n["_id"]),
                "title": n["title"],
                "message": n["message"],
                "type": n["type"],
                "read": n.get("read", False),
                "created_at": n["created_at"].isoformat() if isinstance(n.get("created_at"), datetime) else n.get("created_at"),
            }
            for n in items
        ],
        "unread": unread,
    }


@api_router.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(current_user)):
    await db.notifications.update_many({"user_id": str(user["_id"]), "read": False}, {"$set": {"read": True}})
    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index([("email", 1)], unique=True, partialFilterExpression={"email": {"$type": "string"}})
        await db.users.create_index([("phone", 1)], unique=True, partialFilterExpression={"phone": {"$type": "string"}})
        await db.wallets.create_index("invite_code")
        await db.transactions.create_index([("wallet_id", 1), ("date", -1)])
        await db.files.create_index("path")
        logger.info("Indexes ready")
    except Exception as exc:
        logger.warning("Index creation warning: %s", exc)
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage ready")
    except Exception as exc:
        logger.warning("Object storage init deferred: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
