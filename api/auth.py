import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production-use-env-var")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
bearer = HTTPBearer()


def create_token(data: dict, expires_minutes: int = 120) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def verify_student_token(payload: dict = Depends(verify_token)) -> dict:
    if payload.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return payload


def verify_admin_token(payload: dict = Depends(verify_token)) -> dict:
    if payload.get("role") not in ("admin", "invigilator"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


def verify_superadmin_token(payload: dict = Depends(verify_token)) -> dict:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Super-admin access required")
    return payload


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
