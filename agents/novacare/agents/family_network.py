# ============================================================
# NovaCare v2.0 — Agent 5: Family Intelligence Network
# Caregiver coordination and alerts
# ============================================================

import structlog
from novacare.orchestrator.state import NovaCareState
from novacare.integrations.bedrock_client import translate_text
from novacare.core.dynamo import append_event

logger = structlog.get_logger(__name__)


async def family_network_node(state: NovaCareState) -> NovaCareState:
    """Agent 5: Send alerts and updates to family caregivers."""
    logger.info("agent5_started", abha_id=state["patient_abha_id"])

    try:
        caregiver_ids = state.get("caregiver_ids", [])
        risk_tier = state.get("risk_tier", "GREEN")
        missed_days = state.get("missed_contact_days", 0)
        current_day = state.get("current_day", 0)
        
        # 1. Determine alert type
        alert_type = "escalation" if risk_tier in ("ORANGE", "RED") else "weekly_report"
        
        if missed_days >= 3:
            alert_type = "non_response"
        
        # 2. Generate caregiver message
        if alert_type == "escalation":
            message = f"Your family member's health check shows they may need attention. Risk level: {risk_tier}. Please ensure they take their medications and contact their doctor if symptoms worsen."
        elif alert_type == "non_response":
            message = f"We haven't heard from your family member for {missed_days} days. Please check on them and remind them to respond to daily health check-ins."
        else:
            # Weekly report
            adherence_rate = (state.get("med_adherence_streak", 0) / 7) * 100 if current_day >= 7 else 100
            message = f"Weekly Care Report: Medication adherence: {adherence_rate:.0f}%. Risk level: {risk_tier}. Next appointment: Day {current_day + 7}."
        
        # 3. Translate to caregiver's language (assume same as patient for demo)
        language = state.get("language_pref", "hi")
        if language != "en":
            translated_message = await translate_text(message, language, context="family communication")
        else:
            translated_message = message
        
        # 4. Send WhatsApp to caregivers (mock for demo)
        for caregiver_id in caregiver_ids:
            logger.info(
                "caregiver_alert_sent",
                caregiver_id=caregiver_id,
                alert_type=alert_type,
                risk_tier=risk_tier,
            )
        
        # 5. Log event
        await append_event(
            state["patient_abha_id"],
            "FAMILY_ALERT_SENT",
            "family_network",
            {
                "alert_type": alert_type,
                "caregiver_count": len(caregiver_ids),
                "risk_tier": risk_tier,
            },
        )
        
        logger.info("agent5_completed", abha_id=state["patient_abha_id"], alert_type=alert_type)
        
        return {
            **state,
            "last_agent": "family_network",
        }
        
    except Exception as e:
        logger.error("agent5_failed", error=str(e), abha_id=state["patient_abha_id"])
        return {**state, "errors": state.get("errors", []) + [f"Agent5: {str(e)}"]}
