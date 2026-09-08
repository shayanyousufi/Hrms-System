import os
import enum
from dotenv import load_dotenv

load_dotenv()


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    HR = "HR"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"

_INSECURE_JWT_SECRETS = {
    "your-secret-key-change-in-production",
    "your-super-secret-key-change-this-in-production",
    "change-me",
    "secret",
    "changethis",
    "supersecret",
}


class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./techland.db")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "10"))

    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")

    def validate(self) -> None:
        secret = (self.JWT_SECRET_KEY or "").strip()
        if not secret:
            raise RuntimeError(
                "JWT_SECRET_KEY is not set. Generate one with `python -c \"import secrets; print(secrets.token_urlsafe(64))\"` and add it to backend-v2/.env"
            )
        if secret in _INSECURE_JWT_SECRETS:
            raise RuntimeError(
                "JWT_SECRET_KEY is set to a known insecure placeholder. Replace it with a strong random value in backend-v2/.env"
            )
        if len(secret) < 32:
            raise RuntimeError(
                "JWT_SECRET_KEY is too short (minimum 32 characters). Refusing to start with a weak secret."
            )
        if self.ENVIRONMENT == "production" and (not self.SMTP_USER or not self.SMTP_PASSWORD):
            raise RuntimeError(
                "SMTP_USER and SMTP_PASSWORD must be configured when ENVIRONMENT=production"
            )


settings = Settings()
settings.validate()
