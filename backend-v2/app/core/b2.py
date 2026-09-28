"""Backblaze B2 (S3-compatible) client helpers for employee documents.

Credentials and bucket settings are read from app settings (backend-v2/.env)
and never leave the server. Object keys follow the same relative layout used
previously on disk: employee-documents/<employee_id>/<uuid>.<ext>
"""
import logging

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError, BotoCoreError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


def get_client():
    """Return a lazily-created boto3 S3 client bound to the B2 endpoint."""
    global _client
    if _client is None:
        if not settings.b2_configured:
            raise RuntimeError(
                "B2 storage is not configured. Set B2_KEY_ID, B2_APP_KEY, B2_BUCKET, and B2_ENDPOINT in backend-v2/.env"
            )
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.B2_ENDPOINT}",
            aws_access_key_id=settings.B2_KEY_ID,
            aws_secret_access_key=settings.B2_APP_KEY,
            region_name="us-east-005",
            config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
    return _client


def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Upload bytes to the B2 bucket under the given object key."""
    try:
        get_client().put_object(
            Bucket=settings.B2_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except (ClientError, BotoCoreError) as exc:
        logger.error("B2 put_object failed for key=%s: %s", key, exc)
        raise RuntimeError("Failed to store document") from exc


def get_object_bytes(key: str) -> bytes:
    """Download an object from the B2 bucket and return its bytes."""
    try:
        resp = get_client().get_object(Bucket=settings.B2_BUCKET, Key=key)
        return resp["Body"].read()
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404", "NotFound"):
            raise FileNotFoundError(key) from exc
        logger.error("B2 get_object failed for key=%s: %s", key, exc)
        raise RuntimeError("Failed to fetch document") from exc
    except BotoCoreError as exc:
        logger.error("B2 get_object failed for key=%s: %s", key, exc)
        raise RuntimeError("Failed to fetch document") from exc


def delete_object(key: str) -> None:
    """Delete an object from the B2 bucket; missing keys are ignored."""
    try:
        get_client().delete_object(Bucket=settings.B2_BUCKET, Key=key)
    except (ClientError, BotoCoreError) as exc:
        code = (exc.response or {}).get("Error", {}).get("Code", "") if isinstance(exc, ClientError) else ""
        if code in ("NoSuchKey", "404", "NotFound"):
            return
        logger.warning("B2 delete_object failed for key=%s: %s", key, exc)
        raise RuntimeError("Failed to delete document") from exc
