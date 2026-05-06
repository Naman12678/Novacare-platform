# ============================================================
# NovaCare v2.0 — Agent 6: Outcomes & Learning Loop
# Day 30 outcomes check + model retraining
# ============================================================

import structlog
from novacare.orchestrator.state import NovaCareState
from novacare.core.dynamo import append_event, update_patient_state

logger = structlog.get_logger(__name__)


async def outcomes_learning_node(state: NovaCareState) -> NovaCareState:
    """Agent 6: Check Day 30 outcomes and trigger model retraining."""
    logger.info("agent6_started", abha_id=state["patient_abha_id"])

    try:
        current_day = state.get("current_day", 0)
        
        if current_day < 30:
            logger.warn("outcomes_check_too_early", abha_id=state["patient_abha_id"], day=current_day)
            return state
        
        # 1. Query ABDM for readmission records (mock for demo)
        readmission_detected = False  # In real system, query ABDM API
        
        # 2. Check teleconsult attendance (mock)
        teleconsult_attended = True
        
        # 3. Calculate final adherence rate
        symptom_history = state.get("symptom_history", [])
        total_days = len(symptom_history)
        adherent_days = sum(1 for day in symptom_history if day.get("med_taken", False))
        final_adherence_rate = (adherent_days / total_days * 100) if total_days > 0 else 0
        
        # 4. Create labeled training record for ML model
        training_record = {
            "patient_abha_id": state["patient_abha_id"],
            "episode_id": state["episode_id"],
            "readmitted": readmission_detected,
            "adherence_rate": final_adherence_rate,
            "final_risk_score": state.get("risk_score", 0.0),
            "comorbidity_count": state.get("comorbidity_count", 0),
            "rural_flag": state.get("rural_flag", False),
            "teleconsult_attended": teleconsult_attended,
        }
        
        logger.info(
            "training_record_created",
            abha_id=state["patient_abha_id"],
            readmitted=readmission_detected,
            adherence=final_adherence_rate,
        )
        
        # 5. Update episode status
        await update_patient_state(state["patient_abha_id"], {
            "episode_status": "COMPLETED",
            "readmission_detected": str(readmission_detected),
            "final_adherence_rate": str(final_adherence_rate),
        })
        
        # 6. Log event
        await append_event(
            state["patient_abha_id"],
            "DAY_30_OUTCOMES",
            "outcomes_learning",
            {
                "readmitted": readmission_detected,
                "adherence_rate": final_adherence_rate,
                "teleconsult_attended": teleconsult_attended,
            },
        )
        
        logger.info(
            "agent6_completed",
            abha_id=state["patient_abha_id"],
            readmitted=readmission_detected,
            adherence=final_adherence_rate,
        )
        
        return {
            **state,
            "readmission_detected": readmission_detected,
            "teleconsult_attended": teleconsult_attended,
            "final_adherence_rate": final_adherence_rate,
            "last_agent": "outcomes_learning",
        }
        
    except Exception as e:
        logger.error("agent6_failed", error=str(e), abha_id=state["patient_abha_id"])
        return {**state, "errors": state.get("errors", []) + [f"Agent6: {str(e)}"]}
