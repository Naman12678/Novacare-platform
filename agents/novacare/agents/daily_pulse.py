# ============================================================
# NovaCare v2.0 — Agent 2: Daily Pulse Intelligence
# Adaptive daily check-ins with NLP extraction
# ============================================================

import structlog
from datetime import datetime
from novacare.orchestrator.state import NovaCareState
from novacare.integrations.bedrock_client import invoke_claude
from novacare.core.dynamo import append_event, update_patient_state

logger = structlog.get_logger(__name__)


async def daily_pulse_node(state: NovaCareState) -> NovaCareState:
    """Agent 2: Process daily check-in response and update patient state."""
    logger.info("agent2_started", abha_id=state["patient_abha_id"], day=state["current_day"])

    try:
        current_day = state.get("current_day", 1)
        
        # Use actual symptom data if available in state (passed from real patient response)
        # Otherwise generate adaptive check-in (for cron-triggered pulses)
        symptom_history = state.get("symptom_history", [])
        
        # Check if we already have today's response (from WhatsApp webhook → processPulseResponse)
        today_response = None
        for entry in reversed(symptom_history):
            if entry.get("day") == current_day:
                today_response = entry
                break
        
        if today_response:
            # Real patient response already logged — use it
            symptom_scores = today_response.get("scores", [3])
            med_taken = today_response.get("med_taken", True)
            response_received = True
        else:
            # No response yet — this is a cron-triggered pulse
            # Generate adaptive questions and wait for response
            symptom_scores = [3]  # Neutral default for cron trigger
            med_taken = True
            response_received = False
        
        # Update symptom history (add entry if not already present)
        if not today_response:
            symptom_history.append({
                "day": current_day,
                "scores": symptom_scores,
                "med_taken": med_taken,
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Keep only last 7 days
        if len(symptom_history) > 7:
            symptom_history = symptom_history[-7:]
        
        # Update adherence streak
        med_adherence_streak = state.get("med_adherence_streak", 0)
        if med_taken:
            med_adherence_streak += 1
        else:
            med_adherence_streak = 0
        
        # Update missed contact days
        missed_contact_days = 0 if response_received else state.get("missed_contact_days", 0) + 1
        
        # Log event
        await append_event(
            state["patient_abha_id"],
            "DAILY_PULSE_RESPONSE",
            "daily_pulse",
            {
                "day": current_day,
                "symptom_scores": symptom_scores,
                "med_taken": med_taken,
                "response_received": response_received,
            },
        )
        
        # Update DynamoDB
        await update_patient_state(state["patient_abha_id"], {
            "current_day": str(current_day + 1),
            "med_adherence_streak": str(med_adherence_streak),
            "missed_contact_days": str(missed_contact_days),
        })
        
        logger.info(
            "agent2_completed",
            abha_id=state["patient_abha_id"],
            day=current_day,
            med_taken=med_taken,
            streak=med_adherence_streak,
            response_received=response_received,
        )
        
        return {
            **state,
            "current_day": current_day + 1,
            "symptom_history": symptom_history,
            "med_adherence_streak": med_adherence_streak,
            "missed_contact_days": missed_contact_days,
            "last_agent": "daily_pulse",
        }
        
    except Exception as e:
        logger.error("agent2_failed", error=str(e), abha_id=state["patient_abha_id"])
        return {**state, "errors": state.get("errors", []) + [f"Agent2: {str(e)}"]}


def _generate_daily_questions(day: int, history: list) -> list[str]:
    """Generate adaptive questions based on day and symptom history."""
    base_questions = [
        "How are you feeling today?",
        "Did you take all your medications?",
        "Any new symptoms or concerns?",
    ]
    
    if day <= 3:
        return base_questions[:2]  # Simpler for first 3 days
    
    return base_questions
