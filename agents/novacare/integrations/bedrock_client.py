# ============================================================
# NovaCare v2.0 — Bedrock Client (Claude + Nova)
# ============================================================

import boto3
import json
import structlog
from botocore.exceptions import ClientError
from novacare.core.config import get_settings
from novacare.core.retry import retry_with_backoff, bedrock_circuit_breaker, timeout

logger = structlog.get_logger(__name__)
settings = get_settings()


def _get_bedrock_client():
    """Create Bedrock Runtime client."""
    kwargs = {"region_name": settings.AWS_REGION}
    # Bedrock uses real AWS credentials (not LocalStack)
    # Session token is needed for temporary STS credentials
    if settings.AWS_SESSION_TOKEN:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN
    return boto3.client("bedrock-runtime", **kwargs)


bedrock_client = _get_bedrock_client()


@retry_with_backoff(
    max_retries=3,
    base_delay=1.0,
    max_delay=30.0,
    exceptions=(ClientError, Exception),
)
@timeout(60.0)  # 60 second timeout for Claude calls
async def invoke_claude(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2048,
    temperature: float = 0.3,
) -> str:
    """
    Invoke Claude 3.5 Sonnet on Bedrock with retry and circuit breaker.
    
    Args:
        system_prompt: System prompt for Claude
        user_message: User message
        max_tokens: Maximum tokens to generate
        temperature: Temperature for generation
    
    Returns:
        Generated text response
    """
    try:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        })

        # Apply Bedrock Guardrail for medical safety
        invoke_kwargs = {
            "modelId": settings.BEDROCK_MODEL_ID,
            "body": body,
            "contentType": "application/json",
            "accept": "application/json",
        }
        
        # Add guardrail if configured
        if settings.BEDROCK_GUARDRAIL_ID:
            invoke_kwargs["guardrailIdentifier"] = settings.BEDROCK_GUARDRAIL_ID
            invoke_kwargs["guardrailVersion"] = settings.BEDROCK_GUARDRAIL_VERSION

        response = await bedrock_circuit_breaker.call_async(
            lambda: bedrock_client.invoke_model(**invoke_kwargs)
        )

        result = json.loads(response["body"].read())
        
        # Check if guardrail blocked the response
        if response.get("ResponseMetadata", {}).get("HTTPHeaders", {}).get("x-amzn-bedrock-guardrail-action") == "BLOCKED":
            logger.warn("guardrail_blocked_response", model=settings.BEDROCK_MODEL_ID)
            return "I can only help with your post-discharge care. For medical advice, please consult your doctor."
        
        text = result["content"][0]["text"]
        
        logger.info(
            "claude_invoked",
            tokens_used=result.get("usage", {}).get("output_tokens", 0),
            model=settings.BEDROCK_MODEL_ID,
            guardrail=settings.BEDROCK_GUARDRAIL_ID or "none",
        )
        
        return text

    except TimeoutError as e:
        logger.error("claude_timeout", error=str(e))
        return "[AI generation timed out after 60s]"
    except Exception as e:
        logger.error("claude_invocation_failed", error=str(e))
        # Fallback response for demo resilience
        return f"[AI generation unavailable: {str(e)[:100]}]"


@retry_with_backoff(
    max_retries=3,
    base_delay=0.5,
    max_delay=15.0,
    exceptions=(ClientError, Exception),
)
@timeout(30.0)  # 30 second timeout for Nova Micro
async def invoke_nova_micro(
    prompt: str,
    max_tokens: int = 512,
) -> str:
    """
    Invoke Amazon Nova Micro for fast classification with retry and circuit breaker.
    
    Args:
        prompt: Input prompt
        max_tokens: Maximum tokens to generate
    
    Returns:
        Generated text response
    """
    try:
        body = json.dumps({
            "inputText": prompt,
            "textGenerationConfig": {
                "maxTokenCount": max_tokens,
                "temperature": 0.1,
            },
        })

        response = await bedrock_circuit_breaker.call_async(
            lambda: bedrock_client.invoke_model(
                modelId=settings.BEDROCK_NOVA_MODEL_ID,
                body=body,
                contentType="application/json",
                accept="application/json",
            )
        )

        result = json.loads(response["body"].read())
        return result.get("results", [{}])[0].get("outputText", "")

    except TimeoutError as e:
        logger.error("nova_micro_timeout", error=str(e))
        return ""
    except Exception as e:
        logger.error("nova_micro_failed", error=str(e))
        return ""


async def translate_text(text: str, target_language: str, context: str = "medical") -> str:
    """Translate clinical text to target Indian language using Claude."""
    language_names = {
        "hi": "Hindi", "mr": "Marathi", "ta": "Tamil",
        "te": "Telugu", "bn": "Bengali", "kn": "Kannada",
        "gu": "Gujarati", "ml": "Malayalam", "pa": "Punjabi",
        "or": "Odia", "as": "Assamese", "en": "English",
    }
    lang_name = language_names.get(target_language, "Hindi")

    system = (
        f"You are a medical translator specializing in Indian languages. "
        f"Translate the following {context} text to {lang_name}. "
        f"Use simple, patient-friendly language. Preserve medical terms "
        f"in English when no common {lang_name} equivalent exists. "
        f"Return ONLY the translation, nothing else."
    )

    return await invoke_claude(system, text, max_tokens=1024, temperature=0.2)
