# ============================================================
# NovaCare v2.0 — Agent 4: Pharmacy & Lab Continuity Bridge
# Jan Aushadhi integration + UHI lab booking
# ============================================================

import structlog
from novacare.orchestrator.state import NovaCareState
from novacare.core.dynamo import append_event

logger = structlog.get_logger(__name__)


async def pharmacy_bridge_node(state: NovaCareState) -> NovaCareState:
    """Agent 4: Handle medication refills and lab appointments."""
    logger.info("agent4_started", abha_id=state["patient_abha_id"])

    try:
        medications = state.get("medications", [])
        current_day = state.get("current_day", 0)
        
        # 1. Check if refill needed (simplified logic)
        refill_needed = current_day % 7 == 0 and current_day > 0
        
        if refill_needed:
            # 2. Find nearest Jan Aushadhi store (mock for demo)
            nearest_pharmacy = {
                "name": "Jan Aushadhi Kendra - Pune Central",
                "address": "Shop 12, MG Road, Pune 411001",
                "distance_km": 2.3,
                "phone": "+91-20-12345678",
            }
            
            # 3. Send WhatsApp notification with pharmacy details
            logger.info(
                "pharmacy_refill_triggered",
                abha_id=state["patient_abha_id"],
                pharmacy=nearest_pharmacy["name"],
            )
        
        # 4. Check for lab follow-ups
        lab_due = current_day in [7, 14, 21, 30]
        
        if lab_due:
            # 5. Book lab via UHI (mock for demo)
            lab_appointment = {
                "lab_name": "Thyrocare - Pune",
                "test": "HbA1c, Lipid Profile",
                "date": "2026-05-10",
                "time": "09:00 AM",
            }
            
            logger.info(
                "lab_appointment_booked",
                abha_id=state["patient_abha_id"],
                lab=lab_appointment["lab_name"],
            )
        
        # 6. Log event
        await append_event(
            state["patient_abha_id"],
            "PHARMACY_LAB_CHECK",
            "pharmacy_bridge",
            {
                "refill_needed": refill_needed,
                "lab_due": lab_due,
                "day": current_day,
            },
        )
        
        logger.info("agent4_completed", abha_id=state["patient_abha_id"])
        
        return {
            **state,
            "last_agent": "pharmacy_bridge",
        }
        
    except Exception as e:
        logger.error("agent4_failed", error=str(e), abha_id=state["patient_abha_id"])
        return {**state, "errors": state.get("errors", []) + [f"Agent4: {str(e)}"]}
