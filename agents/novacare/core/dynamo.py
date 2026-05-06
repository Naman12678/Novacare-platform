# ============================================================
# NovaCare v2.0 — DynamoDB Operations
# Patient state management and event logging
# ============================================================

import boto3
import structlog
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from novacare.core.config import get_settings
from novacare.core.retry import retry_with_backoff, dynamodb_circuit_breaker
from decimal import Decimal

logger = structlog.get_logger(__name__)
settings = get_settings()


def _get_dynamodb_client():
    """Create DynamoDB client."""
    kwargs = {"region_name": settings.AWS_REGION}
    if settings.DYNAMODB_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.DYNAMODB_ENDPOINT_URL
    if settings.AWS_SESSION_TOKEN:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN
    return boto3.client("dynamodb", **kwargs)


def _get_dynamodb_resource():
    """Create DynamoDB resource."""
    kwargs = {"region_name": settings.AWS_REGION}
    if settings.DYNAMODB_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.DYNAMODB_ENDPOINT_URL
    if settings.AWS_SESSION_TOKEN:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN
    return boto3.resource("dynamodb", **kwargs)


dynamodb_client = _get_dynamodb_client()
dynamodb_resource = _get_dynamodb_resource()
table = dynamodb_resource.Table(settings.DYNAMODB_TABLE_NAME)


def _python_to_dynamodb(obj):
    """Convert Python types to DynamoDB-compatible types."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _python_to_dynamodb(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_python_to_dynamodb(item) for item in obj]
    return obj


def _dynamodb_to_python(obj):
    """Convert DynamoDB types to Python types."""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _dynamodb_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_dynamodb_to_python(item) for item in obj]
    return obj


@retry_with_backoff(max_retries=3, base_delay=0.5, exceptions=(ClientError, Exception))
async def get_patient_state(abha_id: str) -> dict | None:
    """Retrieve current patient state from DynamoDB with retry logic."""
    try:
        response = await dynamodb_circuit_breaker.call_async(
            lambda: table.get_item(
                Key={
                    "pk": f"PATIENT#{abha_id}",
                    "sk": "STATE#CURRENT",
                }
            )
        )
        
        item = response.get("Item")
        if not item:
            logger.warn("patient_state_not_found", abha_id=abha_id)
            return None
        
        # Convert DynamoDB item to NovaCareState dict with proper types
        state = {
            "patient_abha_id": item.get("patient_abha_id", abha_id),
            "episode_id": item.get("episode_id", ""),
            "hospital_id": item.get("hospital_id", ""),
            "discharge_date": item.get("discharge_date", ""),
            "diagnosis_codes": item.get("diagnosis_codes", []),
            "medications": _dynamodb_to_python(item.get("medications", [])),
            "care_plan_id": item.get("care_plan_id", ""),
            "language_pref": item.get("language_pref", "hi"),
            "contact_channel": item.get("contact_channel", "WHATSAPP"),
            "rural_flag": bool(item.get("rural_flag", False)),
            "comorbidity_count": int(item.get("comorbidity_count", 0)),
            "current_day": int(item.get("current_day", 0)),
            "symptom_history": _dynamodb_to_python(item.get("symptom_history", [])),
            "med_adherence_streak": int(item.get("med_adherence_streak", 0)),
            "missed_contact_days": int(item.get("missed_contact_days", 0)),
            "risk_score": float(item.get("risk_score", 0.0)) if item.get("risk_score") else 0.0,
            "risk_tier": item.get("risk_tier", "GREEN"),
            "shap_explanation": _dynamodb_to_python(item.get("shap_explanation", {})),
            "active_escalation_id": item.get("active_escalation_id"),
            "escalation_tier": item.get("escalation_tier"),
            "caregiver_ids": item.get("caregiver_ids", []),
            "readmission_detected": item.get("readmission_detected"),
            "teleconsult_attended": item.get("teleconsult_attended"),
            "final_adherence_rate": float(item.get("final_adherence_rate")) if item.get("final_adherence_rate") else None,
            "last_agent": item.get("last_agent", ""),
            "next_scheduled_action": item.get("next_scheduled_action", ""),
            "errors": item.get("errors", []),
        }
        
        return state
        
    except Exception as e:
        logger.error("get_patient_state_failed", error=str(e), abha_id=abha_id)
        raise


@retry_with_backoff(max_retries=3, base_delay=0.5, exceptions=(ClientError, Exception))
async def update_patient_state(
    abha_id: str,
    updates: dict,
    expected_version: int | None = None,
) -> bool:
    """
    Update patient state in DynamoDB with optimistic locking.
    
    Args:
        abha_id: Patient ABHA ID
        updates: Dictionary of fields to update
        expected_version: Expected version number for optimistic locking (optional)
    
    Returns:
        True if update succeeded, raises exception otherwise
    """
    try:
        # Convert Python types to DynamoDB types
        updates_converted = _python_to_dynamodb(updates)
        
        # Build update expression
        update_expr_parts = []
        expr_attr_values = {}
        expr_attr_names = {}
        
        for key, value in updates_converted.items():
            # Use attribute names to handle reserved keywords
            attr_name = f"#{key}"
            attr_value = f":{key}"
            update_expr_parts.append(f"{attr_name} = {attr_value}")
            expr_attr_values[attr_value] = value
            expr_attr_names[attr_name] = key
        
        # Add version increment for optimistic locking
        update_expr_parts.append("#version = if_not_exists(#version, :zero) + :inc")
        expr_attr_values[":inc"] = 1
        expr_attr_values[":zero"] = 0
        expr_attr_names["#version"] = "version"
        
        update_expr = "SET " + ", ".join(update_expr_parts)
        
        # Build condition expression for optimistic locking
        condition_expr = None
        if expected_version is not None:
            condition_expr = "#version = :expected_version"
            expr_attr_values[":expected_version"] = expected_version
        
        kwargs = {
            "Key": {
                "pk": f"PATIENT#{abha_id}",
                "sk": "STATE#CURRENT",
            },
            "UpdateExpression": update_expr,
            "ExpressionAttributeValues": expr_attr_values,
            "ExpressionAttributeNames": expr_attr_names,
            "ReturnValues": "UPDATED_NEW",
        }
        
        if condition_expr:
            kwargs["ConditionExpression"] = condition_expr
        
        await dynamodb_circuit_breaker.call_async(
            lambda: table.update_item(**kwargs)
        )
        
        logger.info("patient_state_updated", abha_id=abha_id, fields=list(updates.keys()))
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.error("optimistic_lock_failed", abha_id=abha_id)
            raise Exception("State was modified by another process, please retry")
        logger.error("update_patient_state_failed", error=str(e), abha_id=abha_id)
        raise
    except Exception as e:
        logger.error("update_patient_state_failed", error=str(e), abha_id=abha_id)
        raise


@retry_with_backoff(max_retries=3, base_delay=0.5, exceptions=(ClientError, Exception))
async def create_patient_state(state: dict) -> bool:
    """
    Create initial patient state in DynamoDB with idempotency.
    Uses conditional write to prevent duplicate creation.
    """
    try:
        # Calculate TTL (Day 37 = 30 days + 7 grace days)
        ttl = int((datetime.utcnow() + timedelta(days=37)).timestamp())
        
        # Convert Python types to DynamoDB types
        state_converted = _python_to_dynamodb(state)
        
        item = {
            "pk": f"PATIENT#{state['patient_abha_id']}",
            "sk": "STATE#CURRENT",
            "ttl": ttl,
            "version": 0,  # Initial version for optimistic locking
            "created_at": datetime.utcnow().isoformat(),
            **state_converted,
        }
        
        # Conditional write: only create if doesn't exist (idempotency)
        await dynamodb_circuit_breaker.call_async(
            lambda: table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(pk)",
            )
        )
        
        logger.info("patient_state_created", abha_id=state["patient_abha_id"])
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.warn("patient_state_already_exists", abha_id=state["patient_abha_id"])
            return True  # Idempotent: already exists is success
        logger.error("create_patient_state_failed", error=str(e))
        raise
    except Exception as e:
        logger.error("create_patient_state_failed", error=str(e))
        raise


@retry_with_backoff(max_retries=3, base_delay=0.5, exceptions=(ClientError, Exception))
async def append_event(
    abha_id: str,
    event_type: str,
    agent_id: str,
    payload: dict,
    idempotency_key: str | None = None,
) -> bool:
    """
    Append an event to patient's event log with idempotency.
    
    Args:
        abha_id: Patient ABHA ID
        event_type: Type of event
        agent_id: Agent that generated the event
        payload: Event payload
        idempotency_key: Optional key to prevent duplicate events
    """
    try:
        timestamp = datetime.utcnow().isoformat()
        
        # Use idempotency key if provided, otherwise use timestamp
        sk = f"EVENT#{timestamp}#{event_type}"
        if idempotency_key:
            sk = f"EVENT#{idempotency_key}#{event_type}"
        
        item = {
            "pk": f"PATIENT#{abha_id}",
            "sk": sk,
            "agent_id": agent_id,
            "event_type": event_type,
            "payload": _python_to_dynamodb(payload),
            "timestamp": timestamp,
        }
        
        # Conditional write if idempotency key provided
        kwargs = {"Item": item}
        if idempotency_key:
            kwargs["ConditionExpression"] = "attribute_not_exists(pk)"
        
        await dynamodb_circuit_breaker.call_async(
            lambda: table.put_item(**kwargs)
        )
        
        logger.info("event_appended", abha_id=abha_id, event_type=event_type, agent=agent_id)
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.warn("duplicate_event_prevented", abha_id=abha_id, event_type=event_type)
            return True  # Idempotent: duplicate prevented is success
        logger.error("append_event_failed", error=str(e), abha_id=abha_id)
        raise
    except Exception as e:
        logger.error("append_event_failed", error=str(e), abha_id=abha_id)
        raise


@retry_with_backoff(max_retries=3, base_delay=0.5, exceptions=(ClientError, Exception))
async def get_patient_events(abha_id: str, limit: int = 50) -> list[dict]:
    """Retrieve patient event history with retry logic."""
    try:
        response = await dynamodb_circuit_breaker.call_async(
            lambda: table.query(
                KeyConditionExpression="pk = :pk AND begins_with(sk, :sk_prefix)",
                ExpressionAttributeValues={
                    ":pk": f"PATIENT#{abha_id}",
                    ":sk_prefix": "EVENT#",
                },
                ScanIndexForward=False,  # Descending order (newest first)
                Limit=limit,
            )
        )
        
        items = response.get("Items", [])
        return [_dynamodb_to_python(item) for item in items]
        
    except Exception as e:
        logger.error("get_patient_events_failed", error=str(e), abha_id=abha_id)
        raise
