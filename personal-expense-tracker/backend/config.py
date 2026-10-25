import os

from dotenv import load_dotenv

load_dotenv()

APP_ENV = os.getenv("APP_ENV", "development").lower()
IS_PRODUCTION = APP_ENV == "production"
SECRET_KEY = os.getenv("SECRET_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")

if IS_PRODUCTION:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be configured when APP_ENV=production")
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL must be configured when APP_ENV=production")
    if not FRONTEND_ORIGIN:
        raise RuntimeError("FRONTEND_ORIGIN must be configured when APP_ENV=production")

if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)


class Config:
    SECRET_KEY = SECRET_KEY or "dev-only-change-me"
    SQLALCHEMY_DATABASE_URI = DATABASE_URL or "sqlite:///expenses.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_SECURE = os.getenv(
        "SESSION_COOKIE_SECURE", "true" if IS_PRODUCTION else "false"
    ).lower() == "true"
    FRONTEND_ORIGIN = FRONTEND_ORIGIN or "http://127.0.0.1:5500"
    DEBUG = not IS_PRODUCTION
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")