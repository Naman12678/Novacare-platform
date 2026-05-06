# ============================================================
# NovaCare v2.0 — Agent Service Configuration
# ============================================================

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    # AWS
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = "test"
    AWS_SECRET_ACCESS_KEY: str = "test"
    AWS_SESSION_TOKEN: str | None = None
    AWS_ENDPOINT_URL: str | None = None

    # Bedrock
    BEDROCK_MODEL_ID: str = "anthropic.claude-3-haiku-20240307-v1:0"
    BEDROCK_NOVA_MODEL_ID: str = "amazon.nova-pro-v1:0"
    BEDROCK_GUARDRAIL_ID: str = "rftxnd6f1m1e"
    BEDROCK_GUARDRAIL_VERSION: str = "DRAFT"

    # DynamoDB
    DYNAMODB_TABLE_NAME: str = "novacare_patient_state"
    DYNAMODB_ENDPOINT_URL: str | None = None

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://novacare:novacare_secret@localhost:5432/novacare_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # SageMaker
    SAGEMAKER_ENDPOINT_NAME: str = "novacare-risk-model"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
