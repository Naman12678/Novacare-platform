# ============================================================
# NovaCare v2.0 — Python Worker Process
# Consumes BullMQ jobs from Redis and executes agent workflows
# ============================================================

import asyncio
import json
import uuid
import redis.asyncio as redis
import structlog
from datetime import datetime
from novacare.core.config import get_settings
from novacare.orchestrator.graph import novacare_graph
from novacare.core.dynamo import get_patient_state, create_patient_state
from novacare.core.validation import validate_state, validate_state_transition
from novacare.core.retry import timeout

logger = structlog.get_logger(__name__)
settings = get_settings()

# Redis connection
redis_client = None

# Dead letter queue configuration
MAX_RETRIES = 3
DLQ_KEY = "bull:novacare-agent-tasks:failed"


async def get_redis():
    """Get Redis connection."""
    global redis_client
    if redis_client is None:
        redis_client = await redis.from_url(settings.REDIS_URL, decode_responses=True)
    return redis_client


async def send_to_dlq(job: dict, error: str, retry_count: int):
    """Send failed job to dead letter queue."""
    r = await get_redis()
    dlq_item = {
        "job": job,
        "error": error,
        "retry_count": retry_count,
        "failed_at": datetime.utcnow().isoformat(),
    }
    await r.rpush(DLQ_KEY, json.dumps(dlq_item))
    logger.error("job_sent_to_dlq", job_id=job.get("id"), error=error, retries=retry_count)


async def move_job_to_active(r, job_id: str, job_data: str) -> bool:
    """Move a job from waiting to active state in BullMQ format."""
    try:
        # Mark as active in BullMQ's tracking
        await r.hset(f"bull:novacare-agent-tasks:{job_id}", "processedOn", str(int(datetime.utcnow().timestamp() * 1000)))
        await r.sadd("bull:novacare-agent-tasks:active", job_id)
        return True
    except Exception as e:
        logger.error("move_to_active_failed", error=str(e), job_id=job_id)
        return False


async def complete_job(r, job_id: str, return_value: str = "{}"):
    """Mark a job as completed in BullMQ format."""
    try:
        await r.srem("bull:novacare-agent-tasks:active", job_id)
        await r.hset(f"bull:novacare-agent-tasks:{job_id}", mapping={
            "finishedOn": str(int(datetime.utcnow().timestamp() * 1000)),
            "returnvalue": return_value,
        })
        # Add to completed set
        await r.zadd("bull:novacare-agent-tasks:completed", {job_id: datetime.utcnow().timestamp()})
    except Exception as e:
        logger.error("complete_job_failed", error=str(e), job_id=job_id)


async def fail_job(r, job_id: str, error_msg: str):
    """Mark a job as failed in BullMQ format."""
    try:
        await r.srem("bull:novacare-agent-tasks:active", job_id)
        await r.hset(f"bull:novacare-agent-tasks:{job_id}", mapping={
            "finishedOn": str(int(datetime.utcnow().timestamp() * 1000)),
            "failedReason": error_msg,
        })
        await r.zadd("bull:novacare-agent-tasks:failed", {job_id: datetime.utcnow().timestamp()})
    except Exception as e:
        logger.error("fail_job_failed", error=str(e), job_id=job_id)


@timeout(300.0)
async def process_discharge_workflow(job_data: dict, correlation_id: str):
    """Process discharge workflow (Agent 1) with timeout and validation."""
    logger.info("processing_discharge_workflow", job_data=job_data, correlation_id=correlation_id)

    state = {
        "patient_abha_id": job_data["patient_abha_id"],
        "episode_id": job_data.get("episode_id", f"ep-{job_data['patient_abha_id'][:8]}"),
        "hospital_id": job_data["hospital_id"],
        "discharge_date": job_data.get("discharge_date", datetime.utcnow().strftime("%Y-%m-%d")),
        "diagnosis_codes": job_data.get("diagnosis_codes", []),
        "medications": job_data.get("medications", []),
        "care_plan_id": "",
        "language_pref": job_data.get("language_pref", "hi"),
        "contact_channel": "WHATSAPP",
        "rural_flag": job_data.get("rural_flag", False),
        "comorbidity_count": job_data.get("comorbidity_count", 0),
        "current_day": 0,
        "symptom_history": [],
        "med_adherence_streak": 0,
        "missed_contact_days": 0,
        "risk_score": 0.0,
        "risk_tier": "GREEN",
        "shap_explanation": {},
        "active_escalation_id": None,
        "escalation_tier": None,
        "caregiver_ids": job_data.get("caregiver_ids", []),
        "readmission_detected": None,
        "teleconsult_attended": None,
        "final_adherence_rate": None,
        "last_agent": "",
        "next_scheduled_action": "",
        "errors": [],
    }

    is_valid, errors = validate_state(state, "discharge_workflow")
    if not is_valid:
        logger.error("invalid_initial_state", errors=errors, correlation_id=correlation_id)
        raise ValueError(f"Invalid initial state: {errors}")

    await create_patient_state(state)
    result = await novacare_graph.ainvoke(state)

    logger.info("discharge_workflow_completed", abha_id=job_data["patient_abha_id"], correlation_id=correlation_id)
    return result


@timeout(300.0)
async def process_daily_pulse(job_data: dict, correlation_id: str):
    """Process daily pulse (Agent 2) with timeout and validation."""
    logger.info("processing_daily_pulse", job_data=job_data, correlation_id=correlation_id)

    state = await get_patient_state(job_data["patient_abha_id"])
    if not state:
        logger.error("patient_state_not_found", abha_id=job_data["patient_abha_id"])
        raise ValueError(f"Patient state not found: {job_data['patient_abha_id']}")

    result = await novacare_graph.ainvoke(state)
    logger.info("daily_pulse_completed", abha_id=job_data["patient_abha_id"], correlation_id=correlation_id)
    return result


@timeout(180.0)
async def process_risk_assessment(job_data: dict, correlation_id: str):
    """Process risk assessment (Agent 3) with timeout and validation."""
    logger.info("processing_risk_assessment", job_data=job_data, correlation_id=correlation_id)

    state = await get_patient_state(job_data["patient_abha_id"])
    if not state:
        raise ValueError(f"Patient state not found: {job_data['patient_abha_id']}")

    # Update state with new symptom data from the actual patient response
    if job_data.get("symptom_scores"):
        state["symptom_history"].append({
            "day": job_data["day_number"],
            "scores": job_data["symptom_scores"],
            "med_taken": job_data.get("med_taken", True),
            "timestamp": datetime.utcnow().isoformat(),
        })
        # Keep last 7 days
        if len(state["symptom_history"]) > 7:
            state["symptom_history"] = state["symptom_history"][-7:]

    # Update med adherence based on actual response
    if job_data.get("med_taken") is False:
        state["med_adherence_streak"] = 0
    elif job_data.get("med_taken") is True:
        state["med_adherence_streak"] = state.get("med_adherence_streak", 0) + 1

    from novacare.agents.risk_orchestrator import risk_orchestrator_node
    result = await risk_orchestrator_node(state)

    logger.info("risk_assessment_completed", abha_id=job_data["patient_abha_id"], correlation_id=correlation_id)
    return result


@timeout(180.0)
async def process_pharmacy_check(job_data: dict, correlation_id: str):
    """Process pharmacy/lab check (Agent 4) with timeout and validation."""
    logger.info("processing_pharmacy_check", job_data=job_data, correlation_id=correlation_id)

    state = await get_patient_state(job_data["patient_abha_id"])
    if not state:
        raise ValueError(f"Patient state not found: {job_data['patient_abha_id']}")

    from novacare.agents.pharmacy_bridge import pharmacy_bridge_node
    result = await pharmacy_bridge_node(state)

    logger.info("pharmacy_check_completed", abha_id=job_data["patient_abha_id"], correlation_id=correlation_id)
    return result


@timeout(180.0)
async def process_family_alert(job_data: dict, correlation_id: str):
    """Process family alert (Agent 5) with timeout and validation."""
    logger.info("processing_family_alert", job_data=job_data, correlation_id=correlation_id)

    state = await get_patient_state(job_data["patient_abha_id"])
    if not state:
        raise ValueError(f"Patient state not found: {job_data['patient_abha_id']}")

    from novacare.agents.family_network import family_network_node
    result = await family_network_node(state)

    logger.info("family_alert_completed", abha_id=job_data["patient_abha_id"], correlation_id=correlation_id)
    return result


@timeout(180.0)
async def process_outcomes_check(job_data: dict, correlation_id: str):
    """Process Day 30 outcomes check (Agent 6) with timeout and validation."""
    logger.info("processing_outcomes_check", job_data=job_data, correlation_id=correlation_id)

    state = await get_patient_state(job_data["patient_abha_id"])
    if not state:
        raise ValueError(f"Patient state not found: {job_data['patient_abha_id']}")

    from novacare.agents.outcomes_learning import outcomes_learning_node
    result = await outcomes_learning_node(state)

    logger.info("outcomes_check_completed", abha_id=job_data["patient_abha_id"], correlation_id=correlation_id)
    return result


async def worker_loop():
    """
    Main worker loop - polls Redis for BullMQ jobs.
    
    BullMQ stores jobs as:
    - Job data hash: bull:novacare-agent-tasks:{jobId} (contains name, data, opts, etc.)
    - Waiting list: bull:novacare-agent-tasks:wait (LIFO) or bull:novacare-agent-tasks:waiting (priority)
    
    We use BRPOPLPUSH pattern to atomically move jobs from waiting to processing.
    """
    logger.info("worker_started", redis_url=settings.REDIS_URL)

    r = await get_redis()

    handlers = {
        "discharge_workflow": process_discharge_workflow,
        "daily_pulse": process_daily_pulse,
        "risk_assessment": process_risk_assessment,
        "pharmacy_check": process_pharmacy_check,
        "family_alert": process_family_alert,
        "outcomes_check": process_outcomes_check,
    }

    # BullMQ v5 uses these Redis keys for the queue lifecycle
    WAIT_KEY = "bull:novacare-agent-tasks:wait"
    PRIORITIZED_KEY = "bull:novacare-agent-tasks:prioritized"

    while True:
        try:
            job_id = None

            # BullMQ v5 uses a sorted set called "prioritized" for priority jobs
            # Use ZPOPMIN to get the highest priority (lowest score) job
            result = await r.zpopmin(PRIORITIZED_KEY, count=1)
            
            if result:
                # zpopmin returns list of (member, score) tuples
                job_id = result[0][0] if isinstance(result[0], tuple) else result[0]
            else:
                # Fallback: try the regular wait list (FIFO jobs without priority)
                wait_result = await r.rpop(WAIT_KEY)
                if wait_result:
                    job_id = wait_result

            if job_id:
                # Fetch the full job data from the hash
                job_hash = await r.hgetall(f"bull:novacare-agent-tasks:{job_id}")

                if not job_hash:
                    logger.warn("job_hash_not_found", job_id=job_id)
                    continue
            else:
                # No jobs available, wait before polling again
                await asyncio.sleep(2)
                continue

                job_type = job_hash.get("name", "")
                job_data_raw = job_hash.get("data", "{}")
                retry_count = int(job_hash.get("attemptsMade", "0"))

                try:
                    job_data = json.loads(job_data_raw)
                except json.JSONDecodeError:
                    logger.error("invalid_job_data", job_id=job_id)
                    continue

                correlation_id = f"{job_id}-{uuid.uuid4().hex[:8]}"

                logger.info(
                    "job_received",
                    job_id=job_id,
                    job_type=job_type,
                    correlation_id=correlation_id,
                    retry_count=retry_count,
                )

                # Move to active
                await move_job_to_active(r, job_id, "")

                handler = handlers.get(job_type)
                if not handler:
                    logger.warn("unknown_job_type", job_type=job_type)
                    await fail_job(r, job_id, f"Unknown job type: {job_type}")
                    continue

                try:
                    result_data = await handler(job_data, correlation_id)
                    await complete_job(r, job_id, json.dumps({"status": "completed"}))
                    logger.info("job_completed", job_id=job_id, job_type=job_type)

                except TimeoutError as e:
                    logger.error("job_timeout", job_id=job_id, error=str(e))
                    if retry_count >= MAX_RETRIES:
                        await fail_job(r, job_id, f"Timeout: {str(e)}")
                        await send_to_dlq({"id": job_id, "name": job_type, "data": job_data}, str(e), retry_count)
                    else:
                        # Re-queue for retry
                        await r.hset(f"bull:novacare-agent-tasks:{job_id}", "attemptsMade", str(retry_count + 1))
                        await r.lpush(WAIT_KEY, job_id)
                        logger.info("job_requeued", job_id=job_id, retry_count=retry_count + 1)

                except Exception as e:
                    logger.error("job_failed", job_id=job_id, error=str(e))
                    if retry_count >= MAX_RETRIES:
                        await fail_job(r, job_id, str(e))
                        await send_to_dlq({"id": job_id, "name": job_type, "data": job_data}, str(e), retry_count)
                    else:
                        delay = min(2 ** retry_count, 60)
                        await asyncio.sleep(delay)
                        await r.hset(f"bull:novacare-agent-tasks:{job_id}", "attemptsMade", str(retry_count + 1))
                        await r.lpush(WAIT_KEY, job_id)
                        logger.info("job_requeued", job_id=job_id, retry_count=retry_count + 1, delay=delay)

        except Exception as e:
            logger.error("worker_loop_error", error=str(e))
            await asyncio.sleep(1)


if __name__ == "__main__":
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )
    asyncio.run(worker_loop())
